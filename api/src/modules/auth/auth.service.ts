// path: src/modules/auth/auth.service.ts

import bcrypt from "bcrypt";
import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import { env } from "@/core/config/env";
import { AppError } from "@/core/errors/AppError";
import { prisma } from "@/lib/prisma";
import {
	findUserByEmail,
	findUserById,
	createUser,
	updateUnverifiedUserForRegisterResume,
	upsertEmailOtp,
	findEmailOtpByUserPurpose,
	incrementEmailOtpAttempts,
	deleteEmailOtp,
	markUserEmailVerified,
	createRefreshToken,
	findRefreshToken,
	listActiveRefreshTokenDeviceIds,
	listActiveRefreshTokenSessions,
	revokeRefreshTokensForDevice,
	revokeRefreshToken,
	revokeAllRefreshTokensForUser,
	bumpUserTokenVersion,
	createPasswordResetTicket,
	findPasswordResetTicketByToken,
	markPasswordResetTicketUsed,
	deletePasswordResetTicketsForUser,
} from "@/modules/auth/auth.repository";
import { parseAuthSessionMetadata, serializeAuthSessionMetadata } from "@/modules/auth/auth.sessionMetadata";
import {
	type AuthDeviceSession,
	type AuthTokens,
	type AuthUser,
	type LoginInput,
	type RegisterInput,
	type RegisterResponse,
	type VerifyEmailInput,
	type VerifyEmailResponse,
	type ResendOtpInput,
	type ResendOtpResponse,
	type OtpPurposeInput,
	type LoginResponse,
} from "@/modules/auth/auth.types";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/core/security/jwt";
import { generateNumericOtp, hashOtp } from "@/modules/auth/emailOtp.utils";
import { sendPurposeOtpEmail, sendRegisterOtpEmail } from "@/modules/auth/emailOtp.mailer";
import { OtpPurpose } from "@prisma/client";

export type RequestContext = {
	ip: string | null;
	userAgent: string | null;
	deviceId: string | null;
	deviceName: string | null;
	appClient: string | null;
	correlationId: string | null;
};

const safeCtx = (ctx?: RequestContext): RequestContext => ({
	ip: ctx?.ip ?? null,
	userAgent: ctx?.userAgent ?? null,
	deviceId: ctx?.deviceId ?? null,
	deviceName: ctx?.deviceName ?? null,
	appClient: ctx?.appClient ?? null,
	correlationId: ctx?.correlationId ?? null,
});

// ========= Helpers =========

const normalizeEmail = (email: string): string => {
	const trimmed = email.trim().toLowerCase();
	const [localPart, domainPart] = trimmed.split("@");

	if (!localPart || !domainPart) return trimmed;

	if (domainPart === "gmail.com" || domainPart === "googlemail.com") {
		const plusIndex = localPart.indexOf("+");
		const baseLocal = plusIndex >= 0 ? localPart.slice(0, plusIndex) : localPart;
		const withoutDots = baseLocal.replace(/\./g, "");
		return `${withoutDots}@gmail.com`;
	}

	return `${localPart}@${domainPart}`;
};

const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, env.bcryptRounds);
const verifyPassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

const buildAuthUser = (user: {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	tokenVersion: number;
}): AuthUser => ({
	id: user.id,
	email: user.email,
	firstName: user.firstName,
	lastName: user.lastName,
	tokenVersion: user.tokenVersion,
});

function normalizeDeviceId(deviceId: string | null | undefined): string | null {
	const normalized = String(deviceId ?? "").trim();
	return normalized.length > 0 ? normalized : null;
}

function shouldRelaxDeviceBinding(ctx?: RequestContext): boolean {
	return env.nodeEnv === "development" && ctx?.appClient === "expo-go";
}

async function enforceDeviceCap(
	userId: string,
	deviceId: string | null,
	ctx?: RequestContext,
	db: Parameters<typeof createRefreshToken>[1] = undefined,
): Promise<void> {
	if (!deviceId) return;
	if (shouldRelaxDeviceBinding(ctx)) return;

	const activeDeviceIds = await listActiveRefreshTokenDeviceIds(userId, db);
	if (activeDeviceIds.includes(deviceId)) return;

	if (activeDeviceIds.length >= env.authMaxDevicesPerUser) {
		throw new AppError(StatusCodes.TOO_MANY_REQUESTS, "Device limit reached for this account.", "DEVICE_LIMIT_REACHED", {
			maxDevices: env.authMaxDevicesPerUser,
			activeDeviceCount: activeDeviceIds.length,
		});
	}
}

const createRefreshRecord = async (
	userId: string,
	refreshToken: string,
	ctx?: RequestContext,
	db: Parameters<typeof createRefreshToken>[1] = undefined
): Promise<void> => {
	const now = Date.now();
	const expiresAt = new Date(now + env.jwtRefreshTokenExpiresInDays * 24 * 60 * 60 * 1000);
	const deviceId = normalizeDeviceId(ctx?.deviceId);

	await enforceDeviceCap(userId, deviceId, ctx, db);

	await createRefreshToken(
		{
			userId,
			token: refreshToken,
			expiresAt,
			ip: ctx?.ip ?? null,
			userAgent: deviceId
				? serializeAuthSessionMetadata({
						deviceId,
						deviceName: ctx?.deviceName ?? null,
						clientUserAgent: ctx?.userAgent ?? null,
				  })
				: null,
		},
		db
	);
};

const issueTokens = async (
	user: AuthUser,
	ctx?: RequestContext,
	db: Parameters<typeof createRefreshToken>[1] = undefined
): Promise<AuthTokens> => {
	const payload = {
		sub: user.id,
		email: user.email,
		tokenVersion: user.tokenVersion,
		deviceId: normalizeDeviceId(ctx?.deviceId) ?? undefined,
	};
	const accessToken = signAccessToken(payload);
	const refreshToken = signRefreshToken(payload);

	await createRefreshRecord(user.id, refreshToken, ctx, db);
	return { accessToken, refreshToken };
};

const buildRegisterResponse = (email: string): RegisterResponse => ({
	requiresEmailVerification: true,
	verification: {
		purpose: "REGISTER",
		email,
		expiresInSeconds: env.otpTtlMinutes * 60,
		cooldownSeconds: env.otpResendCooldownSeconds,
	},
});

const buildVerificationEnvelope = (email: string, purpose: OtpPurposeInput) => ({
	purpose,
	email,
	expiresInSeconds: env.otpTtlMinutes * 60,
	cooldownSeconds: env.otpResendCooldownSeconds,
});

const toOtpPurpose = (purpose?: OtpPurposeInput): OtpPurpose => {
	const p = purpose ?? "REGISTER";
	if (p === "REGISTER") return OtpPurpose.REGISTER;
	if (p === "PASSWORD_RESET") return OtpPurpose.PASSWORD_RESET;
	return OtpPurpose.CHANGE_EMAIL;
};

const invalidOrExpired = (): AppError =>
	new AppError(StatusCodes.BAD_REQUEST, "Invalid or expired verification code", "INVALID_OR_EXPIRED_OTP");

type ResendKey = `${string}:${OtpPurpose}`;
const resendTracker = new Map<ResendKey, number[]>();

const pruneOlderThanMs = (arr: number[], cutoff: number): number[] => arr.filter((t) => t >= cutoff);

const getCooldownRemainingSeconds = (lastSentAt: Date): number => {
	const nowMs = Date.now();
	const lastMs = new Date(lastSentAt).getTime();
	const elapsedSec = Math.floor((nowMs - lastMs) / 1000);
	return env.otpResendCooldownSeconds - elapsedSec;
};

const getHourlyCapRemainingSeconds = (history: number[], now: number): number => {
	const oldest = history[0] ?? now;
	return Math.max(1, Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000));
};

const dispatchOtpWithGuards = async (args: {
	userId: string;
	email: string;
	purposeInput: OtpPurposeInput;
}): Promise<{
	sent: boolean;
	verification: ReturnType<typeof buildVerificationEnvelope>;
	cooldownSecondsRemaining?: number;
	hourlyCapReached?: boolean;
	hourlyCapSecondsRemaining?: number;
}> => {
	if (!env.otpEnabled) {
		throw new AppError(StatusCodes.SERVICE_UNAVAILABLE, "Email verification is temporarily unavailable");
	}

	const purpose = toOtpPurpose(args.purposeInput);

	const existingOtp = await findEmailOtpByUserPurpose({ userId: args.userId, purpose });
	if (existingOtp?.lastSentAt) {
		const remaining = getCooldownRemainingSeconds(existingOtp.lastSentAt);
		if (remaining > 0) {
			return {
				sent: false,
				cooldownSecondsRemaining: remaining,
				verification: buildVerificationEnvelope(args.email, args.purposeInput),
			};
		}
	}

	const key: ResendKey = `${args.userId}:${purpose}`;
	const now = Date.now();
	const oneHourAgo = now - 60 * 60 * 1000;

	const history = pruneOlderThanMs(resendTracker.get(key) ?? [], oneHourAgo);

	if (history.length >= env.otpResendHourlyCap) {
		const secondsRemaining = getHourlyCapRemainingSeconds(history, now);
		resendTracker.set(key, history);

		return {
			sent: false,
			hourlyCapReached: true,
			hourlyCapSecondsRemaining: secondsRemaining,
			verification: buildVerificationEnvelope(args.email, args.purposeInput),
		};
	}

	const otp = generateNumericOtp(env.otpLength);
	const codeHash = hashOtp(otp);

	const nowDate = new Date();
	const expiresAt = new Date(nowDate.getTime() + env.otpTtlMinutes * 60 * 1000);

	await upsertEmailOtp({
		userId: args.userId,
		email: args.email,
		purpose,
		codeHash,
		expiresAt,
		lastSentAt: nowDate,
	});

	await sendPurposeOtpEmail({
		to: args.email,
		otp,
		minutesValid: env.otpTtlMinutes,
		purpose: args.purposeInput,
	});

	history.push(now);
	resendTracker.set(key, history);

	return {
		sent: true,
		verification: buildVerificationEnvelope(args.email, args.purposeInput),
	};
};

// ========= Register (OTP-first, no tokens) =========

export const registerUser = async (input: RegisterInput, ctx?: RequestContext): Promise<RegisterResponse> => {
	safeCtx(ctx); // keep parity; service remains ctx-aware for future but audit-free
	const rawEmail = input.email;
	const email = normalizeEmail(rawEmail);

	if (!env.otpEnabled) {
		throw new AppError(StatusCodes.SERVICE_UNAVAILABLE, "Email verification is temporarily unavailable");
	}

	const firstName = input.firstName.trim();
	const lastName = input.lastName.trim();

	const existing = await findUserByEmail(email);

	if (existing?.emailVerified) {
		throw new AppError(StatusCodes.CONFLICT, "Email is already registered", "EMAIL_ALREADY_REGISTERED");
	}

	const passwordHash = await hashPassword(input.password);

	const userRecord = existing
		? await updateUnverifiedUserForRegisterResume({
				userId: existing.id,
				firstName,
				lastName,
				rawEmail: rawEmail.trim(),
				passwordHash,
		  })
		: await createUser({
				firstName,
				lastName,
				email,
				rawEmail: rawEmail.trim(),
				passwordHash,
		  });

	const otp = generateNumericOtp(env.otpLength);
	const codeHash = hashOtp(otp);

	const now = new Date();
	const expiresAt = new Date(now.getTime() + env.otpTtlMinutes * 60 * 1000);

	await upsertEmailOtp({
		userId: userRecord.id,
		email: userRecord.email,
		purpose: OtpPurpose.REGISTER,
		codeHash,
		expiresAt,
		lastSentAt: now,
	});

	await sendRegisterOtpEmail({
		to: userRecord.email,
		otp,
		minutesValid: env.otpTtlMinutes,
	});

	return buildRegisterResponse(userRecord.email);
};

// ========= Verify Email OTP =========

export const verifyEmailOtp = async (input: VerifyEmailInput, ctx?: RequestContext): Promise<VerifyEmailResponse> => {
	safeCtx(ctx);
	const email = normalizeEmail(input.email);
	const purposeInput = input.purpose ?? "REGISTER";
	const purpose = toOtpPurpose(purposeInput);
	const code = String(input.code ?? "").trim();

	if (!env.otpEnabled) {
		throw new AppError(StatusCodes.SERVICE_UNAVAILABLE, "Email verification is temporarily unavailable");
	}

	const user = await findUserByEmail(email);
	if (!user) throw invalidOrExpired();
	const wasAlreadyVerified = user.emailVerified;

	const otpRecord = await findEmailOtpByUserPurpose({ userId: user.id, purpose });
	if (!otpRecord) throw invalidOrExpired();

	const now = new Date();
	if (otpRecord.expiresAt <= now) {
		await deleteEmailOtp({ userId: user.id, purpose }).catch(() => undefined);
		throw invalidOrExpired();
	}

	if (otpRecord.attempts >= env.otpMaxAttempts) {
		await deleteEmailOtp({ userId: user.id, purpose }).catch(() => undefined);
		throw new AppError(
			StatusCodes.BAD_REQUEST,
			"Too many attempts. Please request a new code.",
			"OTP_TOO_MANY_ATTEMPTS"
		);
	}

	const incomingHash = hashOtp(code);

	if (incomingHash !== otpRecord.codeHash) {
		const attemptsAfter = await incrementEmailOtpAttempts({ userId: user.id, purpose });

		if (attemptsAfter >= env.otpMaxAttempts) {
			await deleteEmailOtp({ userId: user.id, purpose }).catch(() => undefined);
			throw new AppError(
				StatusCodes.BAD_REQUEST,
				"Too many attempts. Please request a new code.",
				"OTP_TOO_MANY_ATTEMPTS"
			);
		}

		throw invalidOrExpired();
	}

	const verifiedUser = wasAlreadyVerified ? user : await markUserEmailVerified(user.id);
	await deleteEmailOtp({ userId: user.id, purpose }).catch(() => undefined);

	const authUser = buildAuthUser(verifiedUser);
	const tokens = await issueTokens(authUser, safeCtx(ctx));

	return { user: authUser, tokens };
};

// ========= Resend OTP =========

export const resendEmailOtp = async (input: ResendOtpInput, ctx?: RequestContext): Promise<ResendOtpResponse> => {
	safeCtx(ctx);
	const email = normalizeEmail(input.email);
	const purposeInput: OtpPurposeInput = input.purpose ?? "REGISTER";

	if (!env.otpEnabled) {
		throw new AppError(StatusCodes.SERVICE_UNAVAILABLE, "Email verification is temporarily unavailable");
	}

	const user = await findUserByEmail(email);

	// Anti-enumeration: always return "sent: true" for unknown emails
	if (!user) {
		return {
			sent: true,
			verification: buildVerificationEnvelope(email, purposeInput),
		};
	}

	if (user.emailVerified) {
		return {
			sent: true,
			alreadyVerified: true,
			verification: buildVerificationEnvelope(user.email, purposeInput),
		};
	}

	const result = await dispatchOtpWithGuards({
		userId: user.id,
		email: user.email,
		purposeInput,
	});

	return {
		sent: result.sent,
		verification: result.verification,
		cooldownSecondsRemaining: result.cooldownSecondsRemaining,
		hourlyCapReached: result.hourlyCapReached,
		hourlyCapSecondsRemaining: result.hourlyCapSecondsRemaining,
	};
};

// ========= Login =========

export const loginUser = async (input: LoginInput, ctx?: RequestContext): Promise<LoginResponse> => {
	safeCtx(ctx);
	const email = normalizeEmail(input.email);

	const userRecord = await findUserByEmail(email);

	if (!userRecord) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "Incorrect email or password", "INVALID_CREDENTIALS");
	}

	const isValid = await verifyPassword(input.password, userRecord.passwordHash);
	if (!isValid) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "Incorrect email or password", "INVALID_CREDENTIALS");
	}

	if (!userRecord.isActive) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "Account is inactive. Please contact support.");
	}

	// Block login until verified
	if (!userRecord.emailVerified) {
		const purposeInput: OtpPurposeInput = "REGISTER";

		const result = await dispatchOtpWithGuards({
			userId: userRecord.id,
			email: userRecord.email,
			purposeInput,
		});

		throw new AppError(StatusCodes.FORBIDDEN, "Email verification required.", "EMAIL_VERIFICATION_REQUIRED", {
			verification: buildVerificationEnvelope(userRecord.email, purposeInput),
			sent: result.sent,
			cooldownSecondsRemaining: result.cooldownSecondsRemaining,
			hourlyCapReached: result.hourlyCapReached,
			hourlyCapSecondsRemaining: result.hourlyCapSecondsRemaining,
		});
	}

	const user = buildAuthUser(userRecord);
	const tokens = await issueTokens(user, safeCtx(ctx));

	return { user, tokens };
};

// ========= Refresh Tokens =========

export const refreshTokens = async (
	refreshToken: string,
	ctx?: RequestContext,
): Promise<{ user: AuthUser; tokens: AuthTokens }> => {
	if (!refreshToken) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token is required", "REFRESH_TOKEN_REQUIRED");
	}

	const requestCtx = safeCtx(ctx);

	let payload: any;
	try {
		payload = verifyRefreshToken(refreshToken);
	} catch (err: any) {
		if (err instanceof AppError) throw err;
		throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
	}

	const userId = (payload.sub ?? payload.userId) as string | undefined;
	const payloadVersion = payload.tokenVersion as number | undefined;

	if (!userId) {
		throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid refresh token payload", "INVALID_REFRESH_TOKEN");
	}

	const now = new Date();

	return prisma.$transaction(async (tx) => {
		const stored = await findRefreshToken(userId, refreshToken, tx);

		if (!stored) {
			throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token not found", "REFRESH_TOKEN_NOT_FOUND");
		}

		if (stored.revokedAt) {
			await revokeAllRefreshTokensForUser(userId, tx).catch(() => undefined);
			await bumpUserTokenVersion(userId, tx).catch(() => undefined);
			throw new AppError(
				StatusCodes.UNAUTHORIZED,
				"Refresh token reuse detected",
				"REFRESH_TOKEN_REUSE_DETECTED"
			);
		}

		if (stored.expiresAt < now) {
			await revokeRefreshToken(userId, refreshToken, tx).catch(() => undefined);
			throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token expired", "REFRESH_TOKEN_EXPIRED");
		}

		const requestDeviceId = normalizeDeviceId(requestCtx.deviceId);
		const storedSessionMetadata = parseAuthSessionMetadata(stored.userAgent);
		const storedDeviceId = storedSessionMetadata?.deviceId ?? normalizeDeviceId(stored.userAgent);
		if (!shouldRelaxDeviceBinding(requestCtx) && storedDeviceId && requestDeviceId !== storedDeviceId) {
			await revokeRefreshToken(userId, refreshToken, tx).catch(() => undefined);
			throw new AppError(
				StatusCodes.UNAUTHORIZED,
				"Refresh token used from a different device",
				"REFRESH_TOKEN_DEVICE_MISMATCH",
			);
		}

		const userRecord = await findUserById(userId, tx);
		if (!userRecord || !userRecord.isActive) {
			await revokeRefreshToken(userId, refreshToken, tx).catch(() => undefined);
			throw new AppError(StatusCodes.UNAUTHORIZED, "User not found or inactive", "USER_INACTIVE_OR_MISSING");
		}

		if (typeof payloadVersion === "number" && payloadVersion !== userRecord.tokenVersion) {
			await revokeRefreshToken(userId, refreshToken, tx).catch(() => undefined);
			throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token revoked", "REFRESH_TOKEN_REVOKED");
		}

		const user = buildAuthUser(userRecord);
		const tokens = await issueTokens(user, requestCtx, tx);

		const revokedCount = await revokeRefreshToken(userId, refreshToken, tx);
		if (revokedCount === 0) {
			await revokeAllRefreshTokensForUser(userId, tx).catch(() => undefined);
			await bumpUserTokenVersion(userId, tx).catch(() => undefined);
			throw new AppError(
				StatusCodes.UNAUTHORIZED,
				"Refresh token reuse detected",
				"REFRESH_TOKEN_REUSE_DETECTED"
			);
		}

		return { user, tokens };
	});
};

// ========= Logout =========

export const logoutUser = async (userId: string, refreshToken: string, ctx?: RequestContext): Promise<void> => {
	safeCtx(ctx);

	if (refreshToken) await revokeRefreshToken(userId, refreshToken).catch(() => undefined);
};

// ========= Logout all =========

export const logoutAllSessions = async (userId: string, ctx?: RequestContext): Promise<void> => {
	safeCtx(ctx);

	await revokeAllRefreshTokensForUser(userId);
	await bumpUserTokenVersion(userId);
};

export const listDeviceSessions = async (userId: string, ctx?: RequestContext): Promise<AuthDeviceSession[]> => {
	const requestCtx = safeCtx(ctx);
	const currentDeviceId = normalizeDeviceId(requestCtx.deviceId);
	const sessions = await listActiveRefreshTokenSessions(userId);
	const byDevice = new Map<string, AuthDeviceSession>();

	for (const session of sessions) {
		const metadata = parseAuthSessionMetadata(session.userAgent);
		if (!metadata?.deviceId) continue;

		const existing = byDevice.get(metadata.deviceId);
		if (!existing) {
			byDevice.set(metadata.deviceId, {
				deviceId: metadata.deviceId,
				deviceName: metadata.deviceName,
				lastSeenAt: session.updatedAt.toISOString(),
				firstIssuedAt: session.createdAt.toISOString(),
				expiresAt: session.expiresAt.toISOString(),
				sessionCount: 1,
				isCurrent: metadata.deviceId === currentDeviceId,
			});
			continue;
		}

		existing.sessionCount += 1;
		if (session.updatedAt.toISOString() > existing.lastSeenAt) {
			existing.lastSeenAt = session.updatedAt.toISOString();
		}
		if (session.createdAt.toISOString() < existing.firstIssuedAt) {
			existing.firstIssuedAt = session.createdAt.toISOString();
		}
		if (session.expiresAt.toISOString() > existing.expiresAt) {
			existing.expiresAt = session.expiresAt.toISOString();
		}
		existing.deviceName = existing.deviceName ?? metadata.deviceName;
		existing.isCurrent = existing.isCurrent || metadata.deviceId === currentDeviceId;
	}

	return Array.from(byDevice.values()).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
};

export const revokeDeviceSessions = async (
	userId: string,
	deviceId: string,
	ctx?: RequestContext,
): Promise<{ revokedCount: number }> => {
	const requestCtx = safeCtx(ctx);
	const normalizedDeviceId = normalizeDeviceId(deviceId);
	if (!normalizedDeviceId) {
		throw new AppError(StatusCodes.BAD_REQUEST, "Device id is required", "VALIDATION_ERROR");
	}

	const revokedCount = await revokeRefreshTokensForDevice(userId, normalizedDeviceId);
	if (revokedCount <= 0) {
		throw new AppError(StatusCodes.NOT_FOUND, "Device session not found", "DEVICE_SESSION_NOT_FOUND");
	}

	if (requestCtx.deviceId && normalizedDeviceId === requestCtx.deviceId) {
		await bumpUserTokenVersion(userId).catch(() => undefined);
	}

	return { revokedCount };
};

// ============================================================
// Forgot Password — audit moved to controller (PASSWORD_RESET)
// ============================================================

export type ForgotPasswordInput = { email: string };
export type ForgotPasswordResponse = {
	sent: true;
	message: string;
};

export type VerifyPasswordResetOtpInput = { email: string; code: string };
export type VerifyPasswordResetOtpResponse = {
	resetTicket: string;
	expiresInSeconds: number;
};

export type ResetPasswordInput = { resetTicket: string; newPassword: string };
export type ResetPasswordResponse = { success: true };

const resetTicketInvalidOrExpired = (): AppError =>
	new AppError(StatusCodes.BAD_REQUEST, "Invalid or expired reset ticket", "RESET_TICKET_INVALID_OR_EXPIRED");

export const forgotPassword = async (
	input: ForgotPasswordInput,
	ctx?: RequestContext
): Promise<ForgotPasswordResponse> => {
	safeCtx(ctx);
	const email = normalizeEmail(input.email);

	const response: ForgotPasswordResponse = {
		sent: true,
		message: "If an account exists for that email, we’ll send password reset instructions shortly.",
	};

	if (!env.otpEnabled) {
		// Keep external response stable
		return response;
	}

	const user = await findUserByEmail(email);

	// Unknown email -> stable response
	if (!user) return response;

	if (!user.emailVerified) return response;

	try {
		await dispatchOtpWithGuards({
			userId: user.id,
			email: user.email,
			purposeInput: "PASSWORD_RESET",
		});
	} catch {
		// Swallow to preserve stable response (anti-enumeration)
	}

	return response;
};

export const verifyPasswordResetOtp = async (
	input: VerifyPasswordResetOtpInput,
	ctx?: RequestContext
): Promise<VerifyPasswordResetOtpResponse> => {
	safeCtx(ctx);
	const email = normalizeEmail(input.email);
	const code = String(input.code ?? "").trim();

	if (!env.otpEnabled) {
		throw new AppError(StatusCodes.SERVICE_UNAVAILABLE, "Password reset is temporarily unavailable");
	}

	const user = await findUserByEmail(email);
	if (!user || !user.emailVerified) {
		throw invalidOrExpired();
	}

	const purpose = OtpPurpose.PASSWORD_RESET;

	const otpRecord = await findEmailOtpByUserPurpose({ userId: user.id, purpose });
	if (!otpRecord) throw invalidOrExpired();

	const now = new Date();
	if (otpRecord.expiresAt <= now) {
		await deleteEmailOtp({ userId: user.id, purpose }).catch(() => undefined);
		throw invalidOrExpired();
	}

	if (otpRecord.attempts >= env.otpMaxAttempts) {
		await deleteEmailOtp({ userId: user.id, purpose }).catch(() => undefined);
		throw new AppError(
			StatusCodes.BAD_REQUEST,
			"Too many attempts. Please request a new code.",
			"OTP_TOO_MANY_ATTEMPTS"
		);
	}

	const incomingHash = hashOtp(code);

	if (incomingHash !== otpRecord.codeHash) {
		const attemptsAfter = await incrementEmailOtpAttempts({ userId: user.id, purpose });

		if (attemptsAfter >= env.otpMaxAttempts) {
			await deleteEmailOtp({ userId: user.id, purpose }).catch(() => undefined);
			throw new AppError(
				StatusCodes.BAD_REQUEST,
				"Too many attempts. Please request a new code.",
				"OTP_TOO_MANY_ATTEMPTS"
			);
		}

		throw invalidOrExpired();
	}

	await deleteEmailOtp({ userId: user.id, purpose }).catch(() => undefined);
	await deletePasswordResetTicketsForUser(user.id).catch(() => undefined);

	const ticket = crypto.randomBytes(32).toString("hex");
	const expiresAt = new Date(Date.now() + env.passwordResetTicketTtlMinutes * 60 * 1000);

	await createPasswordResetTicket({
		userId: user.id,
		token: ticket,
		expiresAt,
	});

	return {
		resetTicket: ticket,
		expiresInSeconds: env.passwordResetTicketTtlMinutes * 60,
	};
};

export const resetPassword = async (
	input: ResetPasswordInput,
	ctx?: RequestContext
): Promise<ResetPasswordResponse> => {
	safeCtx(ctx);
	const rawTicket = String(input.resetTicket ?? "").trim();
	const newPassword = String(input.newPassword ?? "");

	if (!rawTicket) throw resetTicketInvalidOrExpired();

	const ticketRecord = await findPasswordResetTicketByToken(rawTicket);
	if (!ticketRecord) throw resetTicketInvalidOrExpired();

	const now = new Date();
	if (ticketRecord.usedAt || ticketRecord.expiresAt <= now) throw resetTicketInvalidOrExpired();

	const passwordHash = await hashPassword(newPassword);

	await prisma.$transaction(async (tx) => {
		await tx.passwordResetTicket.update({
			where: { id: ticketRecord.id },
			data: { usedAt: now },
		});

		await tx.user.update({
			where: { id: ticketRecord.userId },
			data: { passwordHash },
		});

		await tx.refreshToken.deleteMany({ where: { userId: ticketRecord.userId } });
		await tx.user.update({
			where: { id: ticketRecord.userId },
			data: { tokenVersion: { increment: 1 } },
		});
	});

	await markPasswordResetTicketUsed(ticketRecord.id).catch(() => undefined);

	return { success: true };
};
