// path: src/modules/auth/auth.types.ts

export interface AuthUser {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	tokenVersion: number;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

export interface AuthPayload {
	user: AuthUser;
	tokens: AuthTokens;
}

export interface AuthDeviceSession {
	deviceId: string;
	deviceName: string | null;
	lastSeenAt: string;
	firstIssuedAt: string;
	expiresAt: string;
	sessionCount: number;
	isCurrent: boolean;
}

export interface AuthDeviceSessionsPayload {
	maxDevices: number;
	activeDeviceCount: number;
	devices: AuthDeviceSession[];
}

export interface ApiEnvelope<T> {
	success: boolean;
	data: T;
	message?: string;
}

export interface RegisterPayload {
	firstName: string;
	lastName: string;
	email: string;
	password: string;
}

export interface LoginPayload {
	email: string;
	password: string;
}

export interface MePayload {
	userId: string;
	email: string | null;
}

export type OtpPurpose = "REGISTER" | "PASSWORD_RESET" | "CHANGE_EMAIL";

export interface RegisterResponse {
	requiresEmailVerification: true;
	verification: {
		email: string;
		purpose: OtpPurpose;
		expiresInSeconds: number;
		cooldownSeconds: number;
	};
}

export interface VerifyEmailPayload {
	email: string;
	purpose: OtpPurpose;
	code: string; // 6 digits
}

export interface ResendOtpPayload {
	email: string;
	purpose: OtpPurpose;
}

export interface ResendOtpResponse {
	sent: boolean;

	verification?: {
		email: string;
		purpose: OtpPurpose;
		expiresInSeconds: number;
		cooldownSeconds: number;
	};

	cooldownSecondsRemaining?: number;
	cooldownSeconds?: number;
	expiresInSeconds?: number;

	alreadyVerified?: boolean;
	hourlyCapReached?: boolean;
	hourlyCapSecondsRemaining?: number;
}

// ✅ Forgot Password flow contracts
export interface ForgotPasswordPayload {
	email: string;
}

/**
 * Keep response anti-enumeration friendly on UI:
 * always proceed to OTP screen even if email doesn't exist.
 */
export interface ForgotPasswordResponse {
	verification?: {
		email: string;
		purpose: OtpPurpose; // should be PASSWORD_RESET
		expiresInSeconds: number;
		cooldownSeconds: number;
	};
}

export interface VerifyPasswordResetOtpPayload {
	email: string;
	code: string; // 6 digits
}

export interface VerifyPasswordResetOtpResponse {
	resetTicket: string;
	expiresInSeconds: number;
}

export interface ResetPasswordPayload {
	email: string;
	resetTicket: string;
	newPassword: string;
}

export interface ResetPasswordResponse {
	success: true;
}
