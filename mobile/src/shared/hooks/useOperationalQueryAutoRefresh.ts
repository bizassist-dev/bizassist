import { useIsFocused } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useRealtimeConnectionStatus } from "@/modules/realtime/realtime.connection";

type UseOperationalQueryAutoRefreshArgs = {
	enabled?: boolean;
	intervalMs?: number;
};

// Fallback only: websocket invalidation is primary once connected.
const DEFAULT_OPERATIONAL_REFRESH_MS = 60_000;

export function useOperationalQueryAutoRefresh(args?: UseOperationalQueryAutoRefreshArgs): number | false {
	const isFocused = useIsFocused();
	const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
	const { isConnected: isRealtimeConnected } = useRealtimeConnectionStatus();
	const enabled = args?.enabled ?? true;
	const intervalMs = args?.intervalMs ?? DEFAULT_OPERATIONAL_REFRESH_MS;

	useEffect(() => {
		const subscription = AppState.addEventListener("change", setAppState);
		return () => {
			subscription.remove();
		};
	}, []);

	return useMemo(() => {
		if (!enabled) return false;
		if (!isFocused) return false;
		if (appState !== "active") return false;
		if (isRealtimeConnected) return false;
		return intervalMs;
	}, [appState, enabled, intervalMs, isFocused, isRealtimeConnected]);
}
