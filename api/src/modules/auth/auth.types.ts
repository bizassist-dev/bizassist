// path: src/modules/auth/auth.types.ts

export interface RegisterInput {
	firstName: string;
	lastName: string;
	email: string;
	password: string;
}

export interface RegisterResponse {
	requiresEmailVerification: true;
	verification: {
		purpose: "REGISTER";
		email: string;
		expiresInSeconds: number;
		cooldownSeconds: number;
	};
}

export type OtpPurposeInput = "REGISTER" | "PASSWORD_RESET" | "CHANGE_EMAIL";

export interface VerifyEmailInput {
	email: string;
	code: string;
	purpose?: OtpPurposeInput;
}

export interface LoginInput {
	email: string;
	password: string;
}

export interface RefreshInput {
	refreshToken: string;
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

export interface VerifyEmailResponse extends AuthPayload {}

export interface ResendOtpInput {
	email: string;
	purpose?: OtpPurposeInput; // defaults to REGISTER
}

export interface ResendOtpResponse {
	sent: boolean;

	verification: {
		purpose: OtpPurposeInput;
		email: string;
		expiresInSeconds: number;
		cooldownSeconds: number;
	};

	alreadyVerified?: boolean;

	cooldownSecondsRemaining?: number;

	hourlyCapReached?: boolean;
	hourlyCapSecondsRemaining?: number;
}

/**
 * Login response (verified users only).
 * Unverified users are rejected with 403 + code EMAIL_VERIFICATION_REQUIRED.
 */
export type LoginResponse = AuthPayload;
