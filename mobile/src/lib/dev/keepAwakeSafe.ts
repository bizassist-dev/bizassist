// BizAssist_mobile
// path: src/lib/dev/keepAwakeSafe.ts
//
// Dev convenience only. Must never crash production.
// KeepAwake is treated as best-effort and failures are swallowed.

import Constants from "expo-constants";
import * as KeepAwake from "expo-keep-awake";

function isExpoGo(): boolean {
	return Constants.appOwnership === "expo";
}

export async function activateKeepAwakeSafe(tag = "bizassist-dev"): Promise<void> {
	if (!__DEV__) return;

	// Expo Go is the most common environment where KeepAwake can be flaky.
	// If you want it in Expo Go, remove this guard—but keep try/catch.
	if (isExpoGo()) return;

	try {
		await KeepAwake.activateKeepAwakeAsync(tag);
	} catch {
		// ignore
	}
}

export async function deactivateKeepAwakeSafe(tag = "bizassist-dev"): Promise<void> {
	if (!__DEV__) return;

	try {
		// API surface differs by expo-keep-awake version.
		// Prefer async deactivate if present, else fall back to sync.
		const anyKeepAwake = KeepAwake as any;

		if (typeof anyKeepAwake.deactivateKeepAwakeAsync === "function") {
			await anyKeepAwake.deactivateKeepAwakeAsync(tag);
			return;
		}

		if (typeof anyKeepAwake.deactivateKeepAwake === "function") {
			anyKeepAwake.deactivateKeepAwake(tag);
			return;
		}

		// If neither exists, there is nothing to do; keep it silent.
	} catch {
		// ignore
	}
}
