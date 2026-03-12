import { randomUUID } from "crypto";

import pg from "pg";

import { env } from "@/core/config/env";
import {
	deliverRealtimeEventLocally,
	recordRealtimeNotificationReceived,
	recordRealtimePublishedEvent,
} from "@/modules/realtime/realtime.server";
import type { RealtimeEvent } from "@/modules/realtime/realtime.types";

const { Client } = pg;

const REALTIME_CHANNEL = "bizassist_realtime_events";
const RECONNECT_DELAY_MS = 5_000;
const INSTANCE_ID = `${process.pid}-${randomUUID()}`;

type RealtimeInvalidationEvent = Extract<
	RealtimeEvent,
	{
		type: "catalog.product.changed" | "inventory.stock.changed";
	}
>;

type ClusterEnvelope = {
	instanceId: string;
	event: RealtimeInvalidationEvent;
};

let isStarted = false;
let isStopping = false;
let listenerClient: pg.Client | null = null;
let publisherClient: pg.Client | null = null;
let listenerStartingPromise: Promise<void> | null = null;
let publisherConnectingPromise: Promise<pg.Client> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function normalizeStringArray(values?: string[]): string[] | undefined {
	const normalized = (values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean);
	const unique = Array.from(new Set(normalized));
	return unique.length > 0 ? unique : undefined;
}

function normalizeInvalidationEvent(
	event: Omit<RealtimeInvalidationEvent, "occurredAt"> & { occurredAt?: string },
): RealtimeInvalidationEvent {
	return {
		type: event.type,
		businessId: String(event.businessId ?? "").trim(),
		productId: typeof event.productId === "string" ? event.productId.trim() || undefined : undefined,
		productIds: normalizeStringArray(event.productIds),
		occurredAt: event.occurredAt ?? new Date().toISOString(),
	};
}

function isRealtimeInvalidationEvent(value: unknown): value is RealtimeInvalidationEvent {
	if (!value || typeof value !== "object") return false;
	const event = value as Partial<RealtimeInvalidationEvent>;
	if (event.type !== "catalog.product.changed" && event.type !== "inventory.stock.changed") return false;
	return typeof event.businessId === "string" && typeof event.occurredAt === "string";
}

function parseClusterEnvelope(rawPayload: string): ClusterEnvelope | null {
	try {
		const parsed = JSON.parse(rawPayload) as Partial<ClusterEnvelope>;
		if (!parsed || typeof parsed !== "object") return null;
		if (typeof parsed.instanceId !== "string" || parsed.instanceId.trim().length === 0) return null;
		if (!isRealtimeInvalidationEvent(parsed.event)) return null;
		return {
			instanceId: parsed.instanceId,
			event: normalizeInvalidationEvent(parsed.event),
		};
	} catch {
		return null;
	}
}

function scheduleReconnect(): void {
	if (!isStarted || isStopping || reconnectTimer) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		void ensureListenerClient();
	}, RECONNECT_DELAY_MS);
	reconnectTimer.unref?.();
}

function handleListenerDisconnect(client: pg.Client, reason: string, error?: unknown): void {
	if (listenerClient === client) {
		listenerClient = null;
	}
	if (error) {
		console.error(`[realtime] postgres listener ${reason}`, error);
	} else {
		console.warn(`[realtime] postgres listener ${reason}`);
	}
	scheduleReconnect();
}

async function closeClient(client: pg.Client | null): Promise<void> {
	if (!client) return;
	try {
		await client.end();
	} catch {
		// Best-effort shutdown only.
	}
}

async function ensureListenerClient(): Promise<void> {
	if (!isStarted || isStopping || listenerClient || listenerStartingPromise) return;

	listenerStartingPromise = (async () => {
		const client = new Client({ connectionString: env.databaseUrl });
		try {
			client.on("notification", (message) => {
				if (message.channel !== REALTIME_CHANNEL || !message.payload) return;
				const envelope = parseClusterEnvelope(message.payload);
				if (!envelope || envelope.instanceId === INSTANCE_ID) return;

				recordRealtimeNotificationReceived();
				deliverRealtimeEventLocally(envelope.event);
			});

			client.on("error", (error) => {
				handleListenerDisconnect(client, "error", error);
			});

			client.on("end", () => {
				handleListenerDisconnect(client, "ended");
			});

			await client.connect();
			await client.query(`LISTEN ${REALTIME_CHANNEL}`);

			if (!isStarted || isStopping) {
				await closeClient(client);
				return;
			}

			listenerClient = client;
			console.info("[realtime] postgres listener attached", {
				channel: REALTIME_CHANNEL,
				instanceId: INSTANCE_ID,
			});
		} catch (error) {
			await closeClient(client);
			handleListenerDisconnect(client, "failed to attach", error);
		} finally {
			listenerStartingPromise = null;
		}
	})();

	await listenerStartingPromise;
}

async function resetPublisherClient(client: pg.Client): Promise<void> {
	if (publisherClient === client) {
		publisherClient = null;
	}
	await closeClient(client);
}

async function ensurePublisherClient(): Promise<pg.Client> {
	if (publisherClient) return publisherClient;
	if (publisherConnectingPromise) return publisherConnectingPromise;

	publisherConnectingPromise = (async () => {
		const client = new Client({ connectionString: env.databaseUrl });
		client.on("error", (error) => {
			console.error("[realtime] postgres publisher error", error);
			void resetPublisherClient(client);
		});
		client.on("end", () => {
			void resetPublisherClient(client);
		});

		try {
			await client.connect();
			publisherClient = client;
			return client;
		} catch (error) {
			await closeClient(client);
			throw error;
		}
	})();

	try {
		return await publisherConnectingPromise;
	} finally {
		publisherConnectingPromise = null;
	}
}

async function notifyCluster(event: RealtimeInvalidationEvent): Promise<void> {
	const payload = JSON.stringify({
		instanceId: INSTANCE_ID,
		event,
	} satisfies ClusterEnvelope);

	let client: pg.Client | null = null;
	try {
		client = await ensurePublisherClient();
		await client.query("SELECT pg_notify($1, $2)", [REALTIME_CHANNEL, payload]);
	} catch (error) {
		if (client) {
			await resetPublisherClient(client);
		}
		throw error;
	}
}

export function startRealtimePostgresBridge(): void {
	if (isStarted) return;
	isStarted = true;
	isStopping = false;
	void ensureListenerClient();
}

export async function stopRealtimePostgresBridge(): Promise<void> {
	isStarted = false;
	isStopping = true;

	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}

	const currentListener = listenerClient;
	const currentPublisher = publisherClient;
	listenerClient = null;
	publisherClient = null;
	listenerStartingPromise = null;
	publisherConnectingPromise = null;

	await Promise.allSettled([closeClient(currentListener), closeClient(currentPublisher)]);
}

export function publishRealtimeEventToCluster(
	event: Omit<RealtimeInvalidationEvent, "occurredAt"> & { occurredAt?: string },
): void {
	const payload = normalizeInvalidationEvent(event);
	recordRealtimePublishedEvent();
	deliverRealtimeEventLocally(payload);

	void notifyCluster(payload).catch((error) => {
		console.error("[realtime] postgres notify failed", error);
	});
}
