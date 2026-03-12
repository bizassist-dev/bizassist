// path: src/modules/auth/auth.api.ts

import apiClient from "@/lib/api/httpClient";
import { toAuthDomainError } from "./auth.errors";
import {
	ApiEnvelope,
	AuthDeviceSession,
	AuthDeviceSessionsPayload,
	AuthPayload,
	ForgotPasswordPayload,
	ForgotPasswordResponse,
	LoginPayload,
	MePayload,
	RegisterPayload,
	RegisterResponse,
	ResendOtpPayload,
	ResendOtpResponse,
	ResetPasswordPayload,
	ResetPasswordResponse,
	VerifyEmailPayload,
	VerifyPasswordResetOtpPayload,
	VerifyPasswordResetOtpResponse,
} from "./auth.types";

export const setAccessTokenHeader = (token: string | null) => {
	if (!token) {
		delete apiClient.defaults.headers.common.Authorization;
		return;
	}

	apiClient.defaults.headers.common.Authorization = `Bearer ` + token;
};

const handleAuthRequest = async <T>(fn: () => Promise<T>): Promise<T> => {
	try {
		return await fn();
	} catch (error) {
		throw toAuthDomainError(error);
	}
};

export const authApi = {
	register: async (payload: RegisterPayload): Promise<RegisterResponse> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.post<ApiEnvelope<RegisterResponse>>("/auth/register", payload);
			return res.data.data;
		});
	},

	login: async (payload: LoginPayload): Promise<AuthPayload> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.post<ApiEnvelope<AuthPayload>>("/auth/login", payload);
			return res.data.data;
		});
	},

	verifyEmail: async (payload: VerifyEmailPayload): Promise<AuthPayload> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.post<ApiEnvelope<AuthPayload>>("/auth/verify-email", payload);
			return res.data.data;
		});
	},

	resendOtp: async (payload: ResendOtpPayload): Promise<ResendOtpResponse> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.post<ApiEnvelope<ResendOtpResponse>>("/auth/resend-otp", payload);
			return res.data.data;
		});
	},

	// ✅ Forgot Password flow
	forgotPassword: async (payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.post<ApiEnvelope<ForgotPasswordResponse>>("/auth/forgot-password", payload);
			return res.data.data;
		});
	},

	verifyPasswordResetOtp: async (payload: VerifyPasswordResetOtpPayload): Promise<VerifyPasswordResetOtpResponse> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.post<ApiEnvelope<VerifyPasswordResetOtpResponse>>(
				"/auth/verify-password-reset-otp",
				payload,
			);
			return res.data.data;
		});
	},

	resetPassword: async (payload: ResetPasswordPayload): Promise<ResetPasswordResponse> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.post<ApiEnvelope<ResetPasswordResponse>>("/auth/reset-password", payload);
			return res.data.data;
		});
	},

	me: async (): Promise<MePayload> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.get<ApiEnvelope<MePayload>>("/auth/me");
			return res.data.data;
		});
	},

	refresh: async (refreshToken: string): Promise<AuthPayload> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.post<ApiEnvelope<AuthPayload>>("/auth/refresh", { refreshToken });
			return res.data.data;
		});
	},

	logout: async (refreshToken: string): Promise<void> => {
		return handleAuthRequest(async () => {
			await apiClient.post("/auth/logout", { refreshToken });
		});
	},

	logoutAll: async (): Promise<void> => {
		return handleAuthRequest(async () => {
			await apiClient.post("/auth/logout-all");
		});
	},

	listDevices: async (): Promise<AuthDeviceSessionsPayload> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.get<ApiEnvelope<AuthDeviceSessionsPayload>>("/auth/devices");
			return res.data.data;
		});
	},

	revokeDevice: async (deviceId: string): Promise<{ revokedCount: number }> => {
		return handleAuthRequest(async () => {
			const res = await apiClient.post<ApiEnvelope<{ revokedCount: number }>>(
				`/auth/devices/${encodeURIComponent(deviceId)}/revoke`,
			);
			return res.data.data;
		});
	},
};
