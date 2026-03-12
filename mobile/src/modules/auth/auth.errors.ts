// path: src/modules/auth/auth.errors.ts

import { isAxiosError } from "axios";

export type AuthErrorCode =
	| "EMAIL_ALREADY_REGISTERED"
	| "INVALID_CREDENTIALS"
	| "EMAIL_VERIFICATION_REQUIRED"
	| "DEVICE_LIMIT_REACHED"
	| "DEVICE_SESSION_NOT_FOUND"
	| "VALIDATION_ERROR"
	| "NETWORK_ERROR"
	| "RATE_LIMITED"
	| "INVALID_OR_EXPIRED_OTP"
	| "OTP_TOO_MANY_ATTEMPTS"
	| "RESET_TICKET_INVALID_OR_EXPIRED"
	| "UNKNOWN_ERROR";

export interface AuthDomainError extends Error {
	code: AuthErrorCode;
	status?: number;
	fieldErrors?: Record<string, string>;

	email?: string;
	purpose?: "REGISTER" | "PASSWORD_RESET" | "CHANGE_EMAIL";

	cooldownSeconds?: number;
	expiresInSeconds?: number;
	cooldownSecondsRemaining?: number;
	maxDevices?: number;
	activeDeviceCount?: number;
}

const extractApiErrorPayload = (error: any): { status?: number; data?: any } => {
	if (!isAxiosError(error)) return { status: undefined, data: undefined };
	return { status: error.response?.status, data: error.response?.data };
};

export const toAuthDomainError = (error: unknown): AuthDomainError => {
	const { status, data } = extractApiErrorPayload(error as any);

	if (status == null && (!data || Object.keys(data).length === 0)) {
		return {
			name: "AuthDomainError",
			message: "Unable to reach the server. Check your connection and try again.",
			code: "NETWORK_ERROR",
			status: undefined,
		};
	}

	let code: AuthErrorCode = "UNKNOWN_ERROR";
	let message = "Something went wrong. Please try again.";

	const backendMessage: string | undefined = data?.message ?? data?.error ?? data?.errorMessage;
	const backendCode: string | undefined = data?.code ?? data?.errorCode ?? data?.error?.code;

	const zodErrors = data?.errors;
	const details = data?.data ?? data?.details ?? data?.error?.details;

	const verification = details?.verification ?? data?.verification ?? data?.data?.verification;

	const emailFromPayload: string | undefined =
		verification?.email ?? details?.email ?? data?.email ?? data?.data?.email ?? undefined;

	const purposeFromPayload: any =
		verification?.purpose ?? details?.purpose ?? data?.purpose ?? data?.data?.purpose ?? undefined;

	const cooldownSecondsFromPayload: number | undefined =
		verification?.cooldownSeconds ?? details?.cooldownSeconds ?? data?.cooldownSeconds ?? undefined;

	const expiresInSecondsFromPayload: number | undefined =
		verification?.expiresInSeconds ?? details?.expiresInSeconds ?? data?.expiresInSeconds ?? undefined;

	const cooldownSecondsRemainingFromPayload: number | undefined =
		details?.cooldownSecondsRemaining ?? data?.cooldownSecondsRemaining ?? undefined;
	const maxDevicesFromPayload: number | undefined =
		typeof details?.maxDevices === "number"
			? details.maxDevices
			: typeof data?.maxDevices === "number"
				? data.maxDevices
				: undefined;
	const activeDeviceCountFromPayload: number | undefined =
		typeof details?.activeDeviceCount === "number"
			? details.activeDeviceCount
			: typeof data?.activeDeviceCount === "number"
				? data.activeDeviceCount
				: undefined;

	let fieldErrors: Record<string, string> | undefined;

	if (zodErrors && typeof zodErrors === "object") {
		fieldErrors = {};
		if (!Array.isArray(zodErrors)) {
			for (const [field, value] of Object.entries<any>(zodErrors)) {
				if (Array.isArray(value) && value.length > 0) fieldErrors[field] = String(value[0]);
				else if (typeof value === "string") fieldErrors[field] = value;
			}
		}
	}

	// Primary mappings
	if (backendCode === "RATE_LIMITED") {
		code = "RATE_LIMITED";
		message = backendMessage ?? "Too many requests. Please try again later.";
	} else if (backendCode === "INVALID_OR_EXPIRED_OTP") {
		code = "INVALID_OR_EXPIRED_OTP";
		message = backendMessage ?? "Invalid or expired code.";
	} else if (backendCode === "OTP_TOO_MANY_ATTEMPTS") {
		code = "OTP_TOO_MANY_ATTEMPTS";
		message = backendMessage ?? "Too many attempts. Please request a new code.";
	} else if (backendCode === "RESET_TICKET_INVALID_OR_EXPIRED") {
		code = "RESET_TICKET_INVALID_OR_EXPIRED";
		message = backendMessage ?? "Reset session expired. Please request a new code.";
	} else if (backendCode === "DEVICE_LIMIT_REACHED") {
		code = "DEVICE_LIMIT_REACHED";
		message = backendMessage ?? "Device limit reached for this account.";
	} else if (backendCode === "DEVICE_SESSION_NOT_FOUND") {
		code = "DEVICE_SESSION_NOT_FOUND";
		message = backendMessage ?? "That device session no longer exists.";
	} else if (status === 409) {
		code = "EMAIL_ALREADY_REGISTERED";
		message = backendMessage ?? "This email is already registered.";
	} else if (status === 400 || status === 422) {
		code = "VALIDATION_ERROR";
		message = backendMessage ?? "Please check the form and try again.";
	} else if (status === 401 || backendCode === "INVALID_CREDENTIALS") {
		code = "INVALID_CREDENTIALS";
		message = backendMessage ?? "Invalid email or password.";
	} else if (status === 403 || backendCode === "EMAIL_VERIFICATION_REQUIRED") {
		code = "EMAIL_VERIFICATION_REQUIRED";
		message = backendMessage ?? "Email verification required.";
	} else if (backendMessage) {
		message = backendMessage;
	}

	return {
		name: "AuthDomainError",
		message,
		code,
		status,
		fieldErrors,

		email: emailFromPayload,
		purpose: purposeFromPayload,

		cooldownSeconds: cooldownSecondsFromPayload,
		expiresInSeconds: expiresInSecondsFromPayload,
		cooldownSecondsRemaining: cooldownSecondsRemainingFromPayload,
		maxDevices: maxDevicesFromPayload,
		activeDeviceCount: activeDeviceCountFromPayload,
	};
};

export const getAuthHelperText = (error: AuthDomainError): string | null => {
	switch (error.code) {
		case "DEVICE_LIMIT_REACHED": {
			const count = typeof error.activeDeviceCount === "number" ? error.activeDeviceCount : null;
			const max = typeof error.maxDevices === "number" ? error.maxDevices : null;
			if (count != null && max != null) {
				return `${count} of ${max} device slots are currently in use. Remove an old device from Settings > Devices on another signed-in phone, then try again.`;
			}
			if (max != null) {
				return `This account allows up to ${max} active devices. Remove an old device from Settings > Devices on another signed-in phone, then try again.`;
			}
			return "Remove an old device from Settings > Devices on another signed-in phone, then try again.";
		}
		default:
			return null;
	}
};

export const mapAuthErrorToMessage = (error: AuthDomainError): string => {
	switch (error.code) {
		case "NETWORK_ERROR":
			return "Unable to connect. Please check your internet connection and try again.";
		case "EMAIL_ALREADY_REGISTERED":
			return "This email is already registered. Try signing in instead.";
		case "INVALID_CREDENTIALS":
			return "Invalid email or password.";
		case "EMAIL_VERIFICATION_REQUIRED":
			return "Email verification required.";
		case "DEVICE_LIMIT_REACHED":
			return "This account has reached its device limit. Remove an old device or sign out elsewhere.";
		case "DEVICE_SESSION_NOT_FOUND":
			return "That device session was already removed.";
		case "RATE_LIMITED":
			return "Too many requests. Please try again later.";
		case "INVALID_OR_EXPIRED_OTP":
			return "Invalid or expired code.";
		case "OTP_TOO_MANY_ATTEMPTS":
			return "Too many attempts. Please request a new code.";
		case "RESET_TICKET_INVALID_OR_EXPIRED":
			return "Reset session expired. Please request a new code.";
		case "VALIDATION_ERROR":
			return error.message || "Please fix the highlighted fields and try again.";
		default:
			return error.message || "Something went wrong. Please try again.";
	}
};

export const getFieldError = (error: AuthDomainError | null, field: string): string | null => {
	if (!error?.fieldErrors) return null;
	return error.fieldErrors[field] ?? null;
};
