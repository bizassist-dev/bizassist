// path: src/modules/auth/auth.repository.ts

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/core/config/env";
import type { Prisma, User, RefreshToken, EmailOtp, PasswordResetTicket } from "@prisma/client";
import { OtpPurpose, UserRole } from "@prisma/client";
import { parseAuthSessionMetadata } from "@/modules/auth/auth.sessionMetadata";

/**
 * Internal helpers
 */
const newId = (): string => crypto.randomUUID();

const hashRefreshToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Password reset ticket hashing
 * - Never store plaintext tickets
 * - Salt with server secret for defense-in-depth
 *
 * Note: We reuse env.otpHashSecret as the server secret salt to avoid introducing a new required env var.
 */
const hashPasswordResetTicket = (token: string): string => {
	return crypto.createHash("sha256").update(`${token}:${env.otpHashSecret}`).digest("hex");
};

// ========== USER QUERIES ==========

export const findUserByEmail = async (email: string, db: DbClient = prisma): Promise<User | null> => {
	return db.user.findUnique({ where: { email } });
};

export const findUserById = async (id: string, db: DbClient = prisma): Promise<User | null> => {
	return db.user.findUnique({ where: { id } });
};

export const createUser = async (
	data: {
	firstName: string;
	lastName: string;
	email: string;
	rawEmail: string;
	passwordHash: string;
},
	db: DbClient = prisma
): Promise<User> => {
	/**
	 * IMPORTANT:
	 * Your Prisma schema must allow gender to be nullable:
	 *   gender Gender?
	 * Otherwise Prisma will throw P2011 null constraint violation.
	 */
	return db.user.create({
		data: {
			id: newId(),
			email: data.email,
			rawEmail: data.rawEmail,
			passwordHash: data.passwordHash,
			firstName: data.firstName,
			lastName: data.lastName,

			// Gender is intentionally not set during registration.
			// It will be collected later in the Profile feature.

			role: UserRole.OWNER,
			isActive: true,

			emailVerified: false,
			emailVerifiedAt: null,
		},
	});
};

export const updateUnverifiedUserForRegisterResume = async (
	args: {
	userId: string;
	firstName: string;
	lastName: string;
	rawEmail: string;
	passwordHash: string;
},
	db: DbClient = prisma
): Promise<User> => {
	return db.user.update({
		where: { id: args.userId },
		data: {
			firstName: args.firstName,
			lastName: args.lastName,
			rawEmail: args.rawEmail,
			passwordHash: args.passwordHash,

			// Do not touch gender here; profile owns it.
			emailVerified: false,
			emailVerifiedAt: null,
		},
	});
};

export const markUserEmailVerified = async (userId: string, db: DbClient = prisma): Promise<User> => {
	return db.user.update({
		where: { id: userId },
		data: {
			emailVerified: true,
			emailVerifiedAt: new Date(),
		},
	});
};

export const bumpUserTokenVersion = async (userId: string, db: DbClient = prisma): Promise<void> => {
	await db.user.update({
		where: { id: userId },
		data: { tokenVersion: { increment: 1 } },
	});
};

// ========== EMAIL OTP QUERIES ==========

export const upsertEmailOtp = async (
	args: {
	userId: string;
	email: string;
	purpose: OtpPurpose;
	codeHash: string;
	expiresAt: Date;
	lastSentAt: Date;
},
	db: DbClient = prisma
): Promise<EmailOtp> => {
	return db.emailOtp.upsert({
		where: {
			userId_purpose: { userId: args.userId, purpose: args.purpose },
		},
		create: {
			id: newId(),
			userId: args.userId,
			email: args.email,
			purpose: args.purpose,
			codeHash: args.codeHash,
			expiresAt: args.expiresAt,
			attempts: 0,
			lastSentAt: args.lastSentAt,
		},
		update: {
			email: args.email,
			codeHash: args.codeHash,
			expiresAt: args.expiresAt,
			attempts: 0,
			lastSentAt: args.lastSentAt,
		},
	});
};

export const findEmailOtpByUserPurpose = async (
	args: {
	userId: string;
	purpose: OtpPurpose;
},
	db: DbClient = prisma
): Promise<EmailOtp | null> => {
	return db.emailOtp.findUnique({
		where: { userId_purpose: { userId: args.userId, purpose: args.purpose } },
	});
};

export const incrementEmailOtpAttempts = async (
	args: { userId: string; purpose: OtpPurpose },
	db: DbClient = prisma
): Promise<number> => {
	await db.emailOtp.updateMany({
		where: { userId: args.userId, purpose: args.purpose },
		data: { attempts: { increment: 1 } },
	});

	const latest = await findEmailOtpByUserPurpose(args, db);
	return latest?.attempts ?? 0;
};

export const deleteEmailOtp = async (
	args: { userId: string; purpose: OtpPurpose },
	db: DbClient = prisma
): Promise<void> => {
	await db.emailOtp.deleteMany({
		where: { userId: args.userId, purpose: args.purpose },
	});
};

// ========== PASSWORD RESET TICKET QUERIES ==========

export const createPasswordResetTicket = async (
	args: {
	userId: string;
	token: string;
	expiresAt: Date;
},
	db: DbClient = prisma
): Promise<PasswordResetTicket> => {
	return db.passwordResetTicket.create({
		data: {
			id: newId(),
			userId: args.userId,
			tokenHash: hashPasswordResetTicket(args.token),
			expiresAt: args.expiresAt,
			usedAt: null,
		},
	});
};

export const findPasswordResetTicketByToken = async (
	token: string,
	db: DbClient = prisma
): Promise<PasswordResetTicket | null> => {
	return db.passwordResetTicket.findFirst({
		where: {
			tokenHash: hashPasswordResetTicket(token),
		},
	});
};

export const markPasswordResetTicketUsed = async (ticketId: string, db: DbClient = prisma): Promise<void> => {
	await db.passwordResetTicket.update({
		where: { id: ticketId },
		data: { usedAt: new Date() },
	});
};

/**
 * Ensure there is only one valid reset ticket at a time per user.
 * (Service layer can call this before creating a new ticket.)
 */
export const deletePasswordResetTicketsForUser = async (userId: string, db: DbClient = prisma): Promise<void> => {
	await db.passwordResetTicket.deleteMany({
		where: { userId },
	});
};

// ========== REFRESH TOKEN QUERIES ==========

export const createRefreshToken = async (
	args: {
	userId: string;
	token: string;
	expiresAt: Date;
	userAgent?: string | null;
	ip?: string | null;
},
	db: DbClient = prisma
): Promise<RefreshToken> => {
	return db.refreshToken.create({
		data: {
			id: newId(),
			userId: args.userId,
			tokenHash: hashRefreshToken(args.token),
			expiresAt: args.expiresAt,
			revokedAt: null,
			userAgent: args.userAgent ?? null,
			ip: args.ip ?? null,
		},
	});
};

export const findRefreshToken = async (
	userId: string,
	token: string,
	db: DbClient = prisma
): Promise<RefreshToken | null> => {
	return db.refreshToken.findUnique({
		where: { userId_tokenHash: { userId, tokenHash: hashRefreshToken(token) } },
	});
};

export const listActiveRefreshTokenDeviceIds = async (userId: string, db: DbClient = prisma): Promise<string[]> => {
	const records = await db.refreshToken.findMany({
		where: {
			userId,
			revokedAt: null,
			expiresAt: { gt: new Date() },
			userAgent: { not: null },
		},
		select: { userAgent: true },
		distinct: ["userAgent"],
	});

	const deviceIds = records
		.map((record) => parseAuthSessionMetadata(record.userAgent)?.deviceId ?? null)
		.filter((value): value is string => typeof value === "string" && value.trim().length > 0);

	return Array.from(new Set(deviceIds));
};

export const listActiveRefreshTokenSessions = async (
	userId: string,
	db: DbClient = prisma,
): Promise<Array<Pick<RefreshToken, "id" | "userAgent" | "createdAt" | "updatedAt" | "expiresAt">>> => {
	return db.refreshToken.findMany({
		where: {
			userId,
			revokedAt: null,
			expiresAt: { gt: new Date() },
		},
		select: {
			id: true,
			userAgent: true,
			createdAt: true,
			updatedAt: true,
			expiresAt: true,
		},
		orderBy: { updatedAt: "desc" },
	});
};

export const revokeRefreshTokensForDevice = async (
	userId: string,
	deviceId: string,
	db: DbClient = prisma,
): Promise<number> => {
	const activeTokens = await db.refreshToken.findMany({
		where: {
			userId,
			revokedAt: null,
			expiresAt: { gt: new Date() },
		},
		select: {
			id: true,
			userAgent: true,
		},
	});

	const tokenIds = activeTokens
		.filter((token) => parseAuthSessionMetadata(token.userAgent)?.deviceId === deviceId)
		.map((token) => token.id);

	if (tokenIds.length === 0) return 0;

	const result = await db.refreshToken.updateMany({
		where: {
			userId,
			id: { in: tokenIds },
			revokedAt: null,
		},
		data: { revokedAt: new Date() },
	});

	return result.count ?? 0;
};

export const hasActiveRefreshTokenForDevice = async (
	userId: string,
	deviceId: string,
	db: DbClient = prisma,
): Promise<boolean> => {
	const activeTokens = await db.refreshToken.findMany({
		where: {
			userId,
			revokedAt: null,
			expiresAt: { gt: new Date() },
		},
		select: { userAgent: true },
	});

	return activeTokens.some((token) => parseAuthSessionMetadata(token.userAgent)?.deviceId === deviceId);
};

export const deleteRefreshToken = async (userId: string, token: string, db: DbClient = prisma): Promise<void> => {
	await db.refreshToken.deleteMany({
		where: { userId, tokenHash: hashRefreshToken(token) },
	});
};

export const deleteAllRefreshTokensForUser = async (userId: string, db: DbClient = prisma): Promise<void> => {
	await db.refreshToken.deleteMany({ where: { userId } });
};

export const revokeRefreshToken = async (userId: string, token: string, db: DbClient = prisma): Promise<number> => {
	const result = await db.refreshToken.updateMany({
		where: { userId, tokenHash: hashRefreshToken(token), revokedAt: null },
		data: { revokedAt: new Date() },
	});
	return result.count ?? 0;
};

export const revokeAllRefreshTokensForUser = async (userId: string, db: DbClient = prisma): Promise<number> => {
	const result = await db.refreshToken.updateMany({
		where: { userId, revokedAt: null },
		data: { revokedAt: new Date() },
	});
	return result.count ?? 0;
};
type DbClient = Prisma.TransactionClient | typeof prisma;
