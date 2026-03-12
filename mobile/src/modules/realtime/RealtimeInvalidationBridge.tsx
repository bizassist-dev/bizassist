import { useQueryClient } from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveBaseUrl } from "@/lib/api/baseUrl";
import { useAuth } from "@/modules/auth/AuthContext";
import { getAuthClientType, getOrCreateAuthDeviceId } from "@/modules/auth/auth.device";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { catalogKeys } from "@/modules/catalog/catalog.queries";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import { setRealtimeConnectionConnected } from "@/modules/realtime/realtime.connection";

type RealtimeEvent =
	| {
			type: "realtime.ready";
			businessId: string;
			occurredAt: string;
	  }
	| {
			type: "catalog.product.changed" | "inventory.stock.changed";
			businessId: string;
			productId?: string;
			productIds?: string[];
			occurredAt: string;
	  };

const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 10_000;

function buildRealtimeUrl(args: { accessToken: string; businessId: string; deviceId: string; clientType: string }): string {
	const httpUrl = new URL(resolveBaseUrl());
	httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
	httpUrl.pathname = `${httpUrl.pathname.replace(/\/$/, "")}/realtime`;
	httpUrl.searchParams.set("accessToken", args.accessToken);
	httpUrl.searchParams.set("businessId", args.businessId);
	httpUrl.searchParams.set("deviceId", args.deviceId);
	httpUrl.searchParams.set("client", args.clientType);
	return httpUrl.toString();
}

function extractProductIds(event: Extract<RealtimeEvent, { type: "catalog.product.changed" | "inventory.stock.changed" }>): string[] {
	const ids = [
		...(typeof event.productId === "string" ? [event.productId] : []),
		...((event.productIds ?? []).map((value) => String(value ?? "").trim()).filter(Boolean) as string[]),
	];
	return Array.from(new Set(ids));
}

export function RealtimeInvalidationBridge() {
	const queryClient = useQueryClient();
	const { accessToken, isAuthenticated } = useAuth();
	const { businessId, hasBusiness } = useActiveBusinessMeta();
	const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
	const socketRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const reconnectAttemptRef = useRef(0);

	useEffect(() => {
		const subscription = AppState.addEventListener("change", setAppState);
		return () => {
			subscription.remove();
		};
	}, []);

	const shouldConnect = isAuthenticated && !!accessToken && hasBusiness && !!businessId && appState === "active";

	const invalidateForEvent = useCallback(
		(event: Extract<RealtimeEvent, { type: "catalog.product.changed" | "inventory.stock.changed" }>) => {
			const productIds = extractProductIds(event);

			void queryClient.invalidateQueries({ queryKey: inventoryKeys.productsRoot() });
			void queryClient.invalidateQueries({ queryKey: inventoryKeys.productsInfiniteRoot() });
			void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
			void queryClient.invalidateQueries({ queryKey: ["pos", "catalog", "products"] });

			if (event.type === "inventory.stock.changed") {
				void queryClient.invalidateQueries({ queryKey: inventoryKeys.movementsRoot() });
			}

			if (productIds.length === 0) {
				void queryClient.invalidateQueries({ queryKey: inventoryKeys.productDetailRoot() });
				return;
			}

			for (const productId of productIds) {
				void queryClient.invalidateQueries({ queryKey: inventoryKeys.productDetail(productId) });
			}
		},
		[queryClient],
	);

	const realtimeUrl = useMemo(() => {
		if (!shouldConnect || !accessToken || !businessId) return "";
		return buildRealtimeUrl({
			accessToken,
			businessId,
			deviceId: getOrCreateAuthDeviceId(),
			clientType: getAuthClientType(),
		});
	}, [accessToken, businessId, shouldConnect]);

	useEffect(() => {
		function clearReconnectTimer() {
			if (!reconnectTimerRef.current) return;
			clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}

		function closeSocket() {
			const socket = socketRef.current;
			socketRef.current = null;
			setRealtimeConnectionConnected(false);
			if (!socket) return;
			try {
				socket.close();
			} catch {
				// best-effort
			}
		}

		if (!realtimeUrl) {
			clearReconnectTimer();
			closeSocket();
			reconnectAttemptRef.current = 0;
			setRealtimeConnectionConnected(false);
			return;
		}

		let cancelled = false;
		let intentionalClose = false;

		const scheduleReconnect = () => {
			if (cancelled || intentionalClose || !realtimeUrl) return;
			clearReconnectTimer();
			const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttemptRef.current);
			reconnectAttemptRef.current += 1;
			reconnectTimerRef.current = setTimeout(() => {
				if (cancelled || intentionalClose) return;
				connect();
			}, delay);
		};

		const connect = () => {
			const socket = new WebSocket(realtimeUrl);
			socketRef.current = socket;
			setRealtimeConnectionConnected(false);

			socket.onopen = () => {
				reconnectAttemptRef.current = 0;
				setRealtimeConnectionConnected(true);
			};

			socket.onmessage = (message) => {
				try {
					const event = JSON.parse(String(message.data ?? "")) as RealtimeEvent;
					if (event.type === "realtime.ready") return;
					if (event.businessId !== businessId) return;
					invalidateForEvent(event);
				} catch {
					// Ignore malformed payloads; keep the socket alive.
				}
			};

			socket.onerror = () => {
				// Rely on onclose for reconnect behavior.
			};

			socket.onclose = () => {
				if (socketRef.current === socket) {
					socketRef.current = null;
				}
				setRealtimeConnectionConnected(false);
				if (!cancelled && !intentionalClose) {
					scheduleReconnect();
				}
			};
		};

		clearReconnectTimer();
		closeSocket();
		connect();

		return () => {
			cancelled = true;
			intentionalClose = true;
			clearReconnectTimer();
			closeSocket();
			setRealtimeConnectionConnected(false);
		};
	}, [businessId, invalidateForEvent, realtimeUrl]);

	return null;
}
