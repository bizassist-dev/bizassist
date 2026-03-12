// BizAssist_mobile
// path: src/modules/auth/auth.session.ts

import axios from "axios";
import { resolveBaseUrl } from "@/lib/api/baseUrl";
import { getAuthClientType, getAuthDeviceName, getOrCreateAuthDeviceId } from "@/modules/auth/auth.device";
import { clearAuthTokens, getAuthTokens, saveAuthTokens } from "@/modules/auth/auth.storage";
import type { ApiEnvelope, AuthPayload } from "@/modules/auth/auth.types";

type AuthSessionListener = (payload: AuthPayload | null, reason?: string) => void;

const listeners = new Set<AuthSessionListener>();

export const onAuthSessionChange = (listener: AuthSessionListener): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const notify = (payload: AuthPayload | null, reason?: string) => {
	listeners.forEach((listener) => listener(payload, reason));
};

export const applyAuthSession = (payload: AuthPayload, reason?: string): AuthPayload => {
	const { tokens } = payload;
	saveAuthTokens(tokens.accessToken, tokens.refreshToken);
	notify(payload, reason);
	return payload;
};

export const invalidateAuthSession = (reason?: string): void => {
	clearAuthTokens();
	notify(null, reason);
};

const refreshClient = axios.create({
	baseURL: resolveBaseUrl(),
	timeout: 30000,
	headers: { "Content-Type": "application/json" },
});

let refreshInFlight: Promise<AuthPayload> | null = null;

export const refreshSessionSingleFlight = async (): Promise<AuthPayload> => {
	if (refreshInFlight) return refreshInFlight;

	const { refreshToken } = getAuthTokens();
	if (!refreshToken) {
		throw new Error("No refresh token available");
	}

	const startedWith = refreshToken;

	refreshInFlight = (async () => {
		const res = await refreshClient.post<ApiEnvelope<AuthPayload>>(
			"/auth/refresh",
			{ refreshToken },
			{
				headers: {
					"X-Device-Id": getOrCreateAuthDeviceId(),
					"X-Device-Name": getAuthDeviceName(),
					"X-App-Client": getAuthClientType(),
				},
			},
		);
		const payload = res?.data?.data;
		if (!payload) {
			throw new Error("Invalid refresh response");
		}

		// Prevent stale refresh from overwriting a newer session.
		const latest = getAuthTokens().refreshToken;
		if (latest && latest !== startedWith) {
			return payload;
		}

		return applyAuthSession(payload, "refresh");
	})();

	try {
		return await refreshInFlight;
	} finally {
		refreshInFlight = null;
	}
};
