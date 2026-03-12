import * as Device from "expo-device";
import Constants from "expo-constants";

import { tokenStorage } from "@/lib/storage/mmkv";

const AUTH_DEVICE_ID_KEY = "auth.deviceId";

function createDeviceId(): string {
	const randomUuid = globalThis.crypto?.randomUUID?.();
	if (randomUuid) return randomUuid;
	return `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateAuthDeviceId(): string {
	const existing = (tokenStorage.getString(AUTH_DEVICE_ID_KEY) ?? "").trim();
	if (existing) return existing;

	const created = createDeviceId();
	tokenStorage.set(AUTH_DEVICE_ID_KEY, created);
	return created;
}

export function getAuthDeviceName(): string {
	const brand = String(Device.brand ?? "").trim();
	const model = String(Device.modelName ?? "").trim();
	const label = [brand, model].filter(Boolean).join(" ").trim();
	return label || "Mobile Device";
}

export function getAuthClientType(): string {
	return Constants.appOwnership === "expo" ? "expo-go" : "native";
}
