// path: src/core/security/jwt.ts
import jwt, { type Secret, type SignOptions, type JwtPayload as JwtStdPayload } from "jsonwebtoken";
import { env } from "@/core/config/env";
import { AppError } from "@/core/errors/AppError";
import { StatusCodes } from "http-status-codes";
import { FIELD_LIMITS } from "@/shared/fieldLimits.server";

export interface JwtPayload {
	sub: string; // userId
	email: string;
	tokenVersion: number;
	deviceId?: string;
}

export type VerifiedJwtPayload = JwtPayload & JwtStdPayload;

function requireSecret(value: unknown, name: string): Secret {
	if (typeof value !== "string" || value.trim().length < FIELD_LIMITS.jwtSecretMin) {
		throw new Error(`[JWT] Missing/weak secret: ${name}. Must be a non-empty string (recommend 32+ chars).`);
	}
	return value;
}

const accessSecret: Secret = requireSecret(env.jwtAccessTokenSecret, "JWT_ACCESS_TOKEN_SECRET");
const refreshSecret: Secret = requireSecret(env.jwtRefreshTokenSecret, "JWT_REFRESH_TOKEN_SECRET");

function normalizeAccessExpiresIn(value: unknown): SignOptions["expiresIn"] {
	if (typeof value === "string" && value.trim().length > 0) return value.trim() as SignOptions["expiresIn"];
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
	return "15m" as SignOptions["expiresIn"];
}

const accessOptions: SignOptions = {
	expiresIn: normalizeAccessExpiresIn(env.jwtAccessTokenExpiresIn),
};

// ✅ type-safe: expiresIn as numeric seconds
const refreshExpiresInSeconds = Math.max(1, Math.floor(env.jwtRefreshTokenExpiresInDays * 24 * 60 * 60));

const refreshOptions: SignOptions = {
	expiresIn: refreshExpiresInSeconds,
};

export const signAccessToken = (payload: JwtPayload): string => jwt.sign(payload, accessSecret, accessOptions);
export const signRefreshToken = (payload: JwtPayload): string => jwt.sign(payload, refreshSecret, refreshOptions);

function mapJwtVerifyErrorToAppError(err: unknown, code: string): AppError {
	const name = (err as any)?.name as string | undefined;
	if (name === "TokenExpiredError") {
		return new AppError(StatusCodes.UNAUTHORIZED, "Access token expired", code);
	}
	return new AppError(StatusCodes.UNAUTHORIZED, "Invalid or expired access token", code);
}

export const verifyAccessToken = (token: string): VerifiedJwtPayload => {
	try {
		return jwt.verify(token, accessSecret) as VerifiedJwtPayload;
	} catch (err) {
		throw mapJwtVerifyErrorToAppError(err, "INVALID_ACCESS_TOKEN");
	}
};

export const verifyRefreshToken = (token: string): VerifiedJwtPayload => {
	try {
		return jwt.verify(token, refreshSecret) as VerifiedJwtPayload;
	} catch (err) {
		const name = (err as any)?.name as string | undefined;
		if (name === "TokenExpiredError") {
			throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token expired", "REFRESH_TOKEN_EXPIRED");
		}
		throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
	}
};
