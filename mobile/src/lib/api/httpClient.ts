// BizAssist_mobile
// path: src/lib/api/httpClient.ts

import axios from "axios";
import { mmkv, MMKVKeys } from "@/lib/storage/mmkv";
import { resolveBaseUrl, resolveRuntimeEnvironment } from "@/lib/api/baseUrl";
import { getAuthClientType, getAuthDeviceName, getOrCreateAuthDeviceId } from "@/modules/auth/auth.device";
import { getAuthTokens } from "@/modules/auth/auth.storage";
import { refreshSessionSingleFlight, invalidateAuthSession } from "@/modules/auth/auth.session";

function safeTrim(v: unknown): string {
	return typeof v === "string" ? v.trim() : "";
}

/**
 * Active business resolution (robust):
 * - MMKVKeys.activeBusinessId (canonical if present)
 * - legacy raw keys (in case the project used hardcoded strings previously)
 * - JSON blob (e.g., MMKVKeys.activeBusiness storing {"id": "..."} )
 */
function resolveActiveBusinessId(): string {
	// 1) canonical key
	const fromKey = safeTrim(mmkv.getString(MMKVKeys.activeBusinessId));
	if (fromKey) return fromKey;

	// 2) common legacy string keys (defensive)
	const legacy1 = safeTrim(mmkv.getString("activeBusinessId"));
	if (legacy1) return legacy1;

	const legacy2 = safeTrim(mmkv.getString("business.activeBusinessId"));
	if (legacy2) return legacy2;

	// 3) JSON blob (if a module stores the active business object)
	// NOTE: this is intentionally defensive; it won't throw.
	const maybeJson =
		safeTrim(mmkv.getString("activeBusiness")) ||
		safeTrim(mmkv.getString("business.activeBusiness")) ||
		safeTrim(mmkv.getString(String((MMKVKeys as any).activeBusiness ?? "")));

	if (maybeJson) {
		try {
			const parsed = JSON.parse(maybeJson) as any;
			const id = safeTrim(parsed?.id ?? parsed?.businessId ?? parsed?._id);
			if (id) return id;
		} catch {
			// ignore
		}
	}

	return "";
}

const baseURL = resolveBaseUrl();
const runtimeEnv = resolveRuntimeEnvironment();
console.log("[httpClient] env/baseURL =", runtimeEnv, baseURL);

const API_TIMEOUT_MS_RAW = process.env.EXPO_PUBLIC_API_TIMEOUT_MS ?? "30000";
const API_TIMEOUT_MS = Number(API_TIMEOUT_MS_RAW);

const httpClient = axios.create({
	baseURL,
	timeout: Number.isFinite(API_TIMEOUT_MS) ? API_TIMEOUT_MS : 30000,
	headers: { "Content-Type": "application/json" },
});

/**
 * Attach headers for every request:
 * - Authorization: Bearer <accessToken>
 * - X-Active-Business-Id: <activeBusinessId> (business-context-aware API)
 */
httpClient.interceptors.request.use((config) => {
	const { accessToken } = getAuthTokens();
	const token = safeTrim(accessToken);

	const businessId = resolveActiveBusinessId();
	const deviceId = getOrCreateAuthDeviceId();
	const deviceName = getAuthDeviceName();
	const clientType = getAuthClientType();

	config.headers = config.headers ?? {};

	// Authorization
	if (token) {
		(config.headers as any).Authorization = `Bearer ${token}`;
	} else if (config.headers && "Authorization" in (config.headers as object)) {
		delete (config.headers as any).Authorization;
	}

	// Active business context
	if (businessId) {
		(config.headers as any)["X-Active-Business-Id"] = businessId;
	} else if (config.headers && "X-Active-Business-Id" in (config.headers as object)) {
		delete (config.headers as any)["X-Active-Business-Id"];
	}

	(config.headers as any)["X-Device-Id"] = deviceId;
	(config.headers as any)["X-Device-Name"] = deviceName;
	(config.headers as any)["X-App-Client"] = clientType;

	/**
	 * Targeted debug: prove headers for the failing route.
	 * Guarded to avoid log noise.
	 */
	const url = String(config.url ?? "");
	const mediaDebug = __DEV__ && process.env.EXPO_PUBLIC_MEDIA_DEBUG === "true";
	if (mediaDebug && url.includes("/media/signed-upload")) {
		console.log("[media] signed-upload headers", {
			hasAuth: !!token,
			hasActiveBusiness: !!businessId,
			activeBusinessId: businessId ? `${businessId.slice(0, 8)}…` : "",
		});
	}

	return config;
});

const AUTH_ROUTES = [
	"/auth/login",
	"/auth/register",
	"/auth/verify-email",
	"/auth/resend-otp",
	"/auth/refresh",
	"/auth/forgot-password",
	"/auth/verify-password-reset-otp",
	"/auth/reset-password",
	"/auth/logout",
	"/auth/logout-all",
];

function isAuthRoute(url: string): boolean {
	return AUTH_ROUTES.some((route) => url.includes(route));
}

httpClient.interceptors.response.use(
	(response) => response,
	async (error) => {
		const status = error?.response?.status as number | undefined;
		const originalConfig = error?.config as any;

		if (!originalConfig || status !== 401) {
			return Promise.reject(error);
		}

		const url = String(originalConfig.url ?? "");
		if (originalConfig._retry || isAuthRoute(url)) {
			return Promise.reject(error);
		}

		originalConfig._retry = true;
		const startedWithRefreshToken = getAuthTokens().refreshToken;

		try {
			await refreshSessionSingleFlight();
			const { accessToken } = getAuthTokens();
			if (accessToken) {
				originalConfig.headers = originalConfig.headers ?? {};
				originalConfig.headers.Authorization = `Bearer ${accessToken}`;
			}
			originalConfig.headers["X-Device-Id"] = getOrCreateAuthDeviceId();
			originalConfig.headers["X-Device-Name"] = getAuthDeviceName();
			originalConfig.headers["X-App-Client"] = getAuthClientType();
			return httpClient(originalConfig);
		} catch (refreshError) {
			const latestTokens = getAuthTokens();
			if (
				startedWithRefreshToken &&
				latestTokens.refreshToken &&
				latestTokens.refreshToken !== startedWithRefreshToken &&
				latestTokens.accessToken
			) {
				originalConfig.headers = originalConfig.headers ?? {};
				originalConfig.headers.Authorization = `Bearer ${latestTokens.accessToken}`;
				originalConfig.headers["X-Device-Id"] = getOrCreateAuthDeviceId();
				originalConfig.headers["X-Device-Name"] = getAuthDeviceName();
				originalConfig.headers["X-App-Client"] = getAuthClientType();
				return httpClient(originalConfig);
			}

			invalidateAuthSession("refresh_failed");
			return Promise.reject(refreshError);
		}
	},
);

export default httpClient;
export { httpClient };
