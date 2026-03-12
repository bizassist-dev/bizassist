// BizAssist_api
// path: src/core/config/env.ts
//
// Governance:
// - Server-only envs live here. Never read EXPO_PUBLIC_* in the API.
// - Secrets (e.g., SUPABASE_SERVICE_ROLE_KEY) are REQUIRED when their feature is enabled.
// - Fail fast on missing/invalid config.
// - Buckets are server-resolved (clients must not choose buckets).

import "dotenv/config";
import { FIELD_LIMITS } from "@/shared/fieldLimits.server";

const requireEnv = (key: string): string => {
	const value = process.env[key];
	if (!value || value.trim().length === 0) throw new Error(`Missing required environment variable: ${key}`);
	return value.trim();
};

const optionalEnv = (key: string): string | undefined => {
	const value = process.env[key];
	return value && value.trim().length > 0 ? value.trim() : undefined;
};

const toInt = (raw: string | undefined, fallback: number, keyName: string): number => {
	const n = Number(raw ?? fallback);
	if (!Number.isFinite(n)) throw new Error(`Invalid number for ${keyName}`);
	// If it's supposed to be an integer (all our config ints are), enforce it.
	if (!Number.isInteger(n)) throw new Error(`Invalid integer for ${keyName}`);
	return n;
};

const toBool = (raw: string | undefined, fallback: boolean): boolean => {
	if (raw === undefined || raw === null || raw.trim().length === 0) return fallback;
	return ["1", "true", "yes", "y", "on"].includes(raw.trim().toLowerCase());
};

type NodeEnv = "development" | "test" | "production";

export type Env = {
	// Runtime
	nodeEnv: NodeEnv;
	isProd: boolean;
	showStack: boolean;

	port: number;
	corsOrigin: string;

	// Database
	databaseUrl: string;
	directUrl?: string;

	// Auth (JWT)
	jwtAccessTokenSecret: string;
	jwtRefreshTokenSecret: string;
	jwtAccessTokenExpiresIn: string;
	jwtRefreshTokenExpiresInDays: number;

	// Password hashing
	bcryptRounds: number;

	// Rate limiting (Auth)
	authLoginAttemptsPerWindow: number;
	authLoginWindowMs: number;

	authRegisterAttemptsPerWindow: number;
	authRegisterWindowMs: number;

	authRefreshAttemptsPerWindow: number;
	authRefreshWindowMs: number;
	authMaxDevicesPerUser: number;

	// Rate limiting (OTP verify)
	authVerifyEmailAttemptsPerWindow: number;
	authVerifyEmailWindowMs: number;

	// Rate limiting (OTP resend)
	authResendOtpAttemptsPerWindow: number;
	authResendOtpWindowMs: number;

	// Forgot Password
	authForgotPasswordAttemptsPerWindow: number;
	authForgotPasswordWindowMs: number;

	// Verify Password Reset OTP
	authVerifyPasswordResetAttemptsPerWindow: number;
	authVerifyPasswordResetWindowMs: number;

	// Reset Password (ticket)
	authResetPasswordAttemptsPerWindow: number;
	authResetPasswordWindowMs: number;

	// Password reset ticket TTL
	passwordResetTicketTtlMinutes: number;

	// Email (SES)
	awsRegion: string;
	awsAccessKeyId?: string;
	awsSecretAccessKey?: string;
	sesFromEmail?: string;
	sesConfigurationSet?: string;
	emailReplyTo?: string;
	emailProductName: string;
	emailSupport: string;
	emailBrandColor: string;

	// OTP (canonical)
	otpEnabled: boolean;
	otpLength: number;
	otpTtlMinutes: number;
	otpMaxAttempts: number;
	otpResendCooldownSeconds: number;
	otpResendHourlyCap: number;
	otpHashSecret?: string; // required only when otpEnabled=true

	// Supabase (server-side only)
	supabaseEnabled: boolean;
	supabaseUrl?: string;
	supabaseServiceRoleKey?: string;

	// Abuse caps (business-scoped)
	maxCategoriesPerBusiness: number;
	maxDiscountsPerBusiness: number;
	maxCustomUnitsPerBusiness: number;

	/**
	 * Storage governance (server-resolved buckets)
	 * - Clients MUST NOT choose buckets.
	 * - DEFAULT bucket retained only as legacy fallback (for older clients).
	 * - No silent chaining. .env is authoritative.
	 */
	supabaseStorageDefaultBucket?: string;
	supabaseStorageProductBucket?: string;
	supabaseStorageUserBucket?: string;
	supabaseStorageBusinessBucket?: string;
};

const nodeEnv = (process.env.NODE_ENV ?? "development") as NodeEnv;
const isProd = nodeEnv === "production";

// OTP: enabled by default in dev/test; disabled by default in prod unless explicitly enabled.
const otpEnabled = toBool(process.env.OTP_ENABLED, !isProd);

// Supabase: enabled by default (dev + prod), controllable via SUPABASE_ENABLED.
const supabaseEnabled = toBool(process.env.SUPABASE_ENABLED, true);

// Core required env
const databaseUrl = requireEnv("DATABASE_URL");
const directUrl = optionalEnv("DIRECT_URL");

// JWT secrets always required
const jwtAccessTokenSecret = requireEnv("ACCESS_TOKEN_SECRET");
const jwtRefreshTokenSecret = requireEnv("REFRESH_TOKEN_SECRET");

// Supabase required only when enabled
const supabaseUrl = supabaseEnabled ? requireEnv("SUPABASE_URL") : undefined;
const supabaseServiceRoleKey = supabaseEnabled ? requireEnv("SUPABASE_SERVICE_ROLE_KEY") : undefined;

// OTP secret required only when enabled
const otpHashSecret = otpEnabled ? requireEnv("OTP_HASH_SECRET") : optionalEnv("OTP_HASH_SECRET");

// Buckets: .env is authoritative. No silent fallback chaining.
const supabaseStorageDefaultBucket = optionalEnv("SUPABASE_STORAGE_DEFAULT_BUCKET");
const supabaseStorageProductBucket = optionalEnv("SUPABASE_STORAGE_PRODUCT_BUCKET");
const supabaseStorageUserBucket = optionalEnv("SUPABASE_STORAGE_USER_BUCKET");
const supabaseStorageBusinessBucket = optionalEnv("SUPABASE_STORAGE_BUSINESS_BUCKET");

/**
 * SES credentials resolution
 * - Prefer SES-specific keys when present.
 * - Fallback to generic AWS SDK env names for compatibility.
 * - Reject partial credentials to avoid ambiguous runtime auth failures.
 */
const resolveSesCredentials = (): { accessKeyId?: string; secretAccessKey?: string } => {
	const accessKeyId = optionalEnv("SES_AWS_ACCESS_KEY_ID") ?? optionalEnv("AWS_ACCESS_KEY_ID");
	const secretAccessKey = optionalEnv("SES_AWS_SECRET_ACCESS_KEY") ?? optionalEnv("AWS_SECRET_ACCESS_KEY");

	const hasAccessKeyId = !!accessKeyId;
	const hasSecretAccessKey = !!secretAccessKey;

	if (hasAccessKeyId !== hasSecretAccessKey) {
		throw new Error(
			"Invalid SES credential config: provide both access key and secret key, or neither. " +
				"Supported keys: SES_AWS_ACCESS_KEY_ID/SES_AWS_SECRET_ACCESS_KEY or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY."
		);
	}

	return { accessKeyId, secretAccessKey };
};

const sesCredentials = resolveSesCredentials();
const sesRegion = optionalEnv("SES_AWS_REGION") ?? optionalEnv("AWS_REGION") ?? "ap-southeast-1";

export const env: Env = {
	// Runtime
	nodeEnv,
	isProd,
	showStack: toBool(process.env.SHOW_STACK, false),

	port: toInt(process.env.PORT, 4000, "PORT"),
	corsOrigin: optionalEnv("CORS_ORIGIN") ?? (isProd ? "https://bizassist.app" : "*"),

	// Database
	databaseUrl,
	directUrl,

	// Auth (JWT)
	jwtAccessTokenSecret,
	jwtRefreshTokenSecret,
	jwtAccessTokenExpiresIn: optionalEnv("ACCESS_TOKEN_EXPIRES_IN") ?? "15m",
	jwtRefreshTokenExpiresInDays: toInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS, 7, "REFRESH_TOKEN_EXPIRES_IN_DAYS"),

	// Password hashing
	bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 10, "BCRYPT_ROUNDS"),

	// Rate limiting (Auth)
	authLoginAttemptsPerWindow: toInt(process.env.AUTH_LOGIN_ATTEMPTS_PER_WINDOW, 10, "AUTH_LOGIN_ATTEMPTS_PER_WINDOW"),
	authLoginWindowMs: toInt(process.env.AUTH_LOGIN_WINDOW_MS, 10 * 60 * 1000, "AUTH_LOGIN_WINDOW_MS"),

	authRegisterAttemptsPerWindow: toInt(
		process.env.AUTH_REGISTER_ATTEMPTS_PER_WINDOW,
		20,
		"AUTH_REGISTER_ATTEMPTS_PER_WINDOW",
	),
	authRegisterWindowMs: toInt(process.env.AUTH_REGISTER_WINDOW_MS, 60 * 60 * 1000, "AUTH_REGISTER_WINDOW_MS"),

	authRefreshAttemptsPerWindow: toInt(
		process.env.AUTH_REFRESH_ATTEMPTS_PER_WINDOW,
		300,
		"AUTH_REFRESH_ATTEMPTS_PER_WINDOW",
	),
	authRefreshWindowMs: toInt(process.env.AUTH_REFRESH_WINDOW_MS, 15 * 60 * 1000, "AUTH_REFRESH_WINDOW_MS"),
	authMaxDevicesPerUser: toInt(process.env.AUTH_MAX_DEVICES_PER_USER, 5, "AUTH_MAX_DEVICES_PER_USER"),

	// Rate limiting (OTP verify)
	authVerifyEmailAttemptsPerWindow: toInt(
		process.env.AUTH_VERIFY_EMAIL_ATTEMPTS_PER_WINDOW,
		10,
		"AUTH_VERIFY_EMAIL_ATTEMPTS_PER_WINDOW",
	),
	authVerifyEmailWindowMs: toInt(
		process.env.AUTH_VERIFY_EMAIL_WINDOW_MS,
		10 * 60 * 1000,
		"AUTH_VERIFY_EMAIL_WINDOW_MS",
	),

	// Rate limiting (OTP resend)
	authResendOtpAttemptsPerWindow: toInt(
		process.env.AUTH_RESEND_OTP_ATTEMPTS_PER_WINDOW,
		3,
		"AUTH_RESEND_OTP_ATTEMPTS_PER_WINDOW",
	),
	authResendOtpWindowMs: toInt(process.env.AUTH_RESEND_OTP_WINDOW_MS, 60 * 60 * 1000, "AUTH_RESEND_OTP_WINDOW_MS"),

	// Forgot Password
	authForgotPasswordAttemptsPerWindow: toInt(
		process.env.AUTH_FORGOT_PASSWORD_ATTEMPTS_PER_WINDOW,
		5,
		"AUTH_FORGOT_PASSWORD_ATTEMPTS_PER_WINDOW",
	),
	authForgotPasswordWindowMs: toInt(
		process.env.AUTH_FORGOT_PASSWORD_WINDOW_MS,
		10 * 60 * 1000,
		"AUTH_FORGOT_PASSWORD_WINDOW_MS",
	),

	// Verify Password Reset OTP
	authVerifyPasswordResetAttemptsPerWindow: toInt(
		process.env.AUTH_VERIFY_PASSWORD_RESET_ATTEMPTS_PER_WINDOW,
		10,
		"AUTH_VERIFY_PASSWORD_RESET_ATTEMPTS_PER_WINDOW",
	),
	authVerifyPasswordResetWindowMs: toInt(
		process.env.AUTH_VERIFY_PASSWORD_RESET_WINDOW_MS,
		10 * 60 * 1000,
		"AUTH_VERIFY_PASSWORD_RESET_WINDOW_MS",
	),

	// Reset Password (ticket)
	authResetPasswordAttemptsPerWindow: toInt(
		process.env.AUTH_RESET_PASSWORD_ATTEMPTS_PER_WINDOW,
		5,
		"AUTH_RESET_PASSWORD_ATTEMPTS_PER_WINDOW",
	),
	authResetPasswordWindowMs: toInt(
		process.env.AUTH_RESET_PASSWORD_WINDOW_MS,
		10 * 60 * 1000,
		"AUTH_RESET_PASSWORD_WINDOW_MS",
	),

	// Password reset ticket TTL
	passwordResetTicketTtlMinutes: toInt(
		process.env.PASSWORD_RESET_TICKET_TTL_MINUTES,
		15,
		"PASSWORD_RESET_TICKET_TTL_MINUTES",
	),

	// Email (SES)
	awsRegion: sesRegion,
	awsAccessKeyId: sesCredentials.accessKeyId,
	awsSecretAccessKey: sesCredentials.secretAccessKey,
	sesFromEmail: optionalEnv("SES_FROM_EMAIL"),
	sesConfigurationSet: optionalEnv("SES_CONFIGURATION_SET"),
	emailReplyTo: optionalEnv("EMAIL_REPLY_TO"),
	emailProductName: optionalEnv("EMAIL_PRODUCT_NAME") ?? "BizAssist AI",
	emailSupport: optionalEnv("EMAIL_SUPPORT") ?? "support@bizassist.app",
	emailBrandColor: optionalEnv("EMAIL_BRAND_COLOR") ?? "#2563EB",

	// OTP (canonical)
	otpEnabled,
	otpLength: toInt(process.env.OTP_LENGTH, FIELD_LIMITS.otpCode, "OTP_LENGTH"),
	otpTtlMinutes: toInt(process.env.OTP_TTL_MINUTES, 10, "OTP_TTL_MINUTES"),
	otpMaxAttempts: toInt(process.env.OTP_MAX_ATTEMPTS, 5, "OTP_MAX_ATTEMPTS"),
	otpResendCooldownSeconds: toInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60, "OTP_RESEND_COOLDOWN_SECONDS"),
	otpResendHourlyCap: toInt(process.env.OTP_RESEND_HOURLY_CAP, 3, "OTP_RESEND_HOURLY_CAP"),
	otpHashSecret,

	// Abuse caps (business-scoped)
	maxCategoriesPerBusiness: toInt(
		process.env.MAX_CATEGORIES_PER_BUSINESS,
		200,
		"MAX_CATEGORIES_PER_BUSINESS",
	),
	maxDiscountsPerBusiness: toInt(
		process.env.MAX_DISCOUNTS_PER_BUSINESS,
		300,
		"MAX_DISCOUNTS_PER_BUSINESS",
	),
	maxCustomUnitsPerBusiness: toInt(
		process.env.MAX_CUSTOM_UNITS_PER_BUSINESS,
		100,
		"MAX_CUSTOM_UNITS_PER_BUSINESS",
	),

	// Supabase (server-side)
	supabaseEnabled,
	supabaseUrl,
	supabaseServiceRoleKey,

	// Storage buckets (server-resolved)
	supabaseStorageDefaultBucket,
	supabaseStorageProductBucket,
	supabaseStorageUserBucket,
	supabaseStorageBusinessBucket,
};

// Optional named exports (legacy convenience)
export const SUPABASE_STORAGE_DEFAULT_BUCKET = env.supabaseStorageDefaultBucket;
export const SUPABASE_STORAGE_PRODUCT_BUCKET = env.supabaseStorageProductBucket;
export const SUPABASE_STORAGE_USER_BUCKET = env.supabaseStorageUserBucket;
export const SUPABASE_STORAGE_BUSINESS_BUCKET = env.supabaseStorageBusinessBucket;
