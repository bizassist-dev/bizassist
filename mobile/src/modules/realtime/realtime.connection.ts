import { useSyncExternalStore } from "react";

type RealtimeConnectionSnapshot = {
	isConnected: boolean;
};

let snapshot: RealtimeConnectionSnapshot = {
	isConnected: false,
};

const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of listeners) {
		listener();
	}
}

export function setRealtimeConnectionConnected(isConnected: boolean): void {
	if (snapshot.isConnected === isConnected) return;
	snapshot = { isConnected };
	emit();
}

export function useRealtimeConnectionStatus(): RealtimeConnectionSnapshot {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		() => snapshot,
		() => snapshot,
	);
}
