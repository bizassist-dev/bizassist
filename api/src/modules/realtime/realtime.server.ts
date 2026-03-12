import type { IncomingMessage, Server as HttpServer } from "http";

import { WebSocket, WebSocketServer } from "ws";
import { StatusCodes } from "http-status-codes";

import { env } from "@/core/config/env";
import { AppError } from "@/core/errors/AppError";
import { verifyAccessToken } from "@/core/security/jwt";
import { prisma } from "@/lib/prisma";
import { hasActiveRefreshTokenForDevice } from "@/modules/auth/auth.repository";
import type { RealtimeEvent } from "@/modules/realtime/realtime.types";

type RealtimeConnectionContext = {
	userId: string;
	email: string;
	businessId: string;
	deviceId: string | null;
};

const REALTIME_PATH = "/api/v1/realtime";
const HEARTBEAT_INTERVAL_MS = 30_000;
const STATS_LOG_INTERVAL_MS = 60_000;
const MAX_CONNECTIONS_PER_USER_BUSINESS = 15;
const DEVICE_REVOKED_CLOSE_CODE = 4001;

const realtimeServer = new WebSocketServer({ noServer: true });
const connectionContextBySocket = new Map<WebSocket, RealtimeConnectionContext>();
const heartbeatAliveBySocket = new WeakMap<WebSocket, boolean>();
const realtimeStats = {
	upgradeAttempts: 0,
	upgradeAccepted: 0,
	upgradeRejected: 0,
	publishedEvents: 0,
	receivedNotifications: 0,
	localDeliveries: 0,
};

function buildRequestUrl(req: IncomingMessage): URL {
	return new URL(req.url ?? "/", "http://localhost");
}

function isRealtimeRequest(req: IncomingMessage): boolean {
	return buildRequestUrl(req).pathname === REALTIME_PATH;
}

function getHeaderValue(req: IncomingMessage, headerName: string): string {
	const raw = req.headers[headerName.toLowerCase()];
	if (Array.isArray(raw)) return String(raw[0] ?? "").trim();
	return String(raw ?? "").trim();
}

function readBearerToken(req: IncomingMessage, url: URL): string {
	const queryToken = url.searchParams.get("accessToken")?.trim();
	if (queryToken) return queryToken;

	const authHeader = getHeaderValue(req, "authorization");
	if (!authHeader.startsWith("Bearer ")) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "MISSING_AUTH_HEADER", "Missing or invalid Authorization header.");
	}

	const token = authHeader.slice("Bearer ".length).trim();
	if (!token) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "MISSING_BEARER_TOKEN", "Missing bearer token.");
	}
	return token;
}

function readBusinessId(req: IncomingMessage, url: URL): string | null {
	const queryValue = url.searchParams.get("businessId")?.trim();
	if (queryValue) return queryValue;

	const headerValue = getHeaderValue(req, "x-active-business-id");
	return headerValue || null;
}

function readDeviceId(req: IncomingMessage, url: URL): string | null {
	const queryValue = url.searchParams.get("deviceId")?.trim();
	if (queryValue) return queryValue;

	const headerValue = getHeaderValue(req, "x-device-id");
	return headerValue || null;
}

function shouldRelaxDeviceBinding(req: IncomingMessage, url: URL): boolean {
	return env.nodeEnv === "development" && (url.searchParams.get("client")?.trim() || getHeaderValue(req, "x-app-client")) === "expo-go";
}

async function authenticateRealtimeRequest(req: IncomingMessage): Promise<RealtimeConnectionContext> {
	const url = buildRequestUrl(req);
	const token = readBearerToken(req, url);
	const payload = verifyAccessToken(token);
	const userId = payload.sub?.trim();

	if (!userId) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_TOKEN_PAYLOAD", "Invalid token payload.");
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			email: true,
			tokenVersion: true,
			isActive: true,
			activeBusinessId: true,
		},
	});

	if (!user || !user.isActive) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "USER_INACTIVE_OR_MISSING", "User not found or inactive.");
	}

	if (!user.email) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "USER_EMAIL_MISSING", "User email is missing.");
	}

	if (typeof payload.tokenVersion === "number" && payload.tokenVersion !== user.tokenVersion) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "ACCESS_TOKEN_REVOKED", "Access token is no longer valid.");
	}

	const deviceId = readDeviceId(req, url);
	if (!shouldRelaxDeviceBinding(req, url) && payload.deviceId && deviceId !== payload.deviceId) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "Device mismatch for realtime token.", "ACCESS_TOKEN_DEVICE_MISMATCH");
	}
	if (!shouldRelaxDeviceBinding(req, url) && payload.deviceId && !(await hasActiveRefreshTokenForDevice(user.id, payload.deviceId))) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "Device session has been revoked.", "ACCESS_TOKEN_DEVICE_REVOKED");
	}

	const businessId = readBusinessId(req, url) ?? user.activeBusinessId?.trim() ?? "";
	if (!businessId) {
		throw new AppError(StatusCodes.FORBIDDEN, "BUSINESS_ACTIVATION_REQUIRED", "Business activation required.");
	}

	return {
		userId: user.id,
		email: user.email,
		businessId,
		deviceId,
	};
}

function countConnectionsForScope(scope: RealtimeConnectionContext): number {
	let total = 0;
	for (const context of connectionContextBySocket.values()) {
		if (context.userId === scope.userId && context.businessId === scope.businessId) {
			total += 1;
		}
	}
	return total;
}

function rejectUpgrade(
	socket: {
		write: (chunk: string) => unknown;
		destroy: () => void;
	},
	statusCode: number,
	message: string,
): void {
	socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`);
	socket.destroy();
}

function registerRealtimeSocket(ws: WebSocket, context: RealtimeConnectionContext): void {
	connectionContextBySocket.set(ws, context);
	heartbeatAliveBySocket.set(ws, true);
	realtimeStats.upgradeAccepted += 1;

	ws.on("pong", () => {
		heartbeatAliveBySocket.set(ws, true);
	});

	ws.on("close", () => {
		connectionContextBySocket.delete(ws);
		heartbeatAliveBySocket.delete(ws);
	});

	ws.on("error", () => {
		// Socket lifecycle handles cleanup on close/terminate.
	});

	const readyEvent: RealtimeEvent = {
		type: "realtime.ready",
		businessId: context.businessId,
		occurredAt: new Date().toISOString(),
	};
	ws.send(JSON.stringify(readyEvent));
}

const heartbeatTimer = setInterval(() => {
	for (const ws of connectionContextBySocket.keys()) {
		if (heartbeatAliveBySocket.get(ws) === false) {
			connectionContextBySocket.delete(ws);
			heartbeatAliveBySocket.delete(ws);
			ws.terminate();
			continue;
		}

		heartbeatAliveBySocket.set(ws, false);
		if (ws.readyState === WebSocket.OPEN) {
			ws.ping();
		}
	}
}, HEARTBEAT_INTERVAL_MS);

heartbeatTimer.unref?.();

const statsTimer = setInterval(() => {
	if (connectionContextBySocket.size === 0 && realtimeStats.publishedEvents === 0 && realtimeStats.upgradeAttempts === 0) {
		return;
	}

		console.info("[realtime] stats", {
			currentConnections: connectionContextBySocket.size,
			upgradeAttempts: realtimeStats.upgradeAttempts,
			upgradeAccepted: realtimeStats.upgradeAccepted,
			upgradeRejected: realtimeStats.upgradeRejected,
			publishedEvents: realtimeStats.publishedEvents,
			receivedNotifications: realtimeStats.receivedNotifications,
			localDeliveries: realtimeStats.localDeliveries,
		});
	}, STATS_LOG_INTERVAL_MS);

statsTimer.unref?.();

export function attachRealtimeServer(server: HttpServer): void {
	server.on("upgrade", (req, socket, head) => {
		if (!isRealtimeRequest(req)) return;
		realtimeStats.upgradeAttempts += 1;

		void (async () => {
			try {
				const context = await authenticateRealtimeRequest(req);
				if (countConnectionsForScope(context) >= MAX_CONNECTIONS_PER_USER_BUSINESS) {
					realtimeStats.upgradeRejected += 1;
					rejectUpgrade(socket, StatusCodes.TOO_MANY_REQUESTS, "Too Many Connections");
					return;
				}

				realtimeServer.handleUpgrade(req, socket, head, (ws) => {
					registerRealtimeSocket(ws, context);
				});
			} catch (error) {
				realtimeStats.upgradeRejected += 1;
				const statusCode = error instanceof AppError ? error.statusCode : StatusCodes.UNAUTHORIZED;
				rejectUpgrade(socket, statusCode, "Unauthorized");
			}
		})();
	});
}

function normalizeProductIds(event: { productId?: string; productIds?: string[] }): string[] | undefined {
	const merged = [
		...(typeof event.productId === "string" ? [event.productId] : []),
		...((event.productIds ?? []).map((value) => String(value ?? "").trim()).filter(Boolean) as string[]),
	];
	const unique = Array.from(new Set(merged));
	return unique.length > 0 ? unique : undefined;
}

export function recordRealtimePublishedEvent(): void {
	realtimeStats.publishedEvents += 1;
}

export function recordRealtimeNotificationReceived(): void {
	realtimeStats.receivedNotifications += 1;
}

export function deliverRealtimeEventLocally(event: RealtimeEvent): void {
	const payload: RealtimeEvent =
		event.type === "realtime.ready"
			? {
					type: event.type,
					businessId: event.businessId,
					occurredAt: event.occurredAt ?? new Date().toISOString(),
			  }
			: {
					type: event.type,
					businessId: event.businessId,
					productId: event.productId,
					productIds: normalizeProductIds(event),
					occurredAt: event.occurredAt ?? new Date().toISOString(),
			  };

	realtimeStats.localDeliveries += 1;
	const encoded = JSON.stringify(payload);
	for (const [ws, context] of connectionContextBySocket.entries()) {
		if (context.businessId !== payload.businessId) continue;
		if (ws.readyState !== WebSocket.OPEN) continue;
		ws.send(encoded);
	}
}

export function disconnectRealtimeConnectionsForDevice(userId: string, deviceId: string): void {
	for (const [ws, context] of connectionContextBySocket.entries()) {
		if (context.userId !== userId) continue;
		if (context.deviceId !== deviceId) continue;
		connectionContextBySocket.delete(ws);
		heartbeatAliveBySocket.delete(ws);
		try {
			ws.close(DEVICE_REVOKED_CLOSE_CODE, "device_revoked");
		} catch {
			ws.terminate();
		}
	}
}
