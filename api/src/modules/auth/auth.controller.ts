// path: src/modules/auth/auth.controller.ts

import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";
import { AuditStatus } from "@prisma/client";

import { env } from "@/core/config/env";
import { prisma } from "@/lib/prisma";
import { disconnectRealtimeConnectionsForDevice } from "@/modules/realtime/realtime.server";

import {
	registerUser,
	loginUser,
	verifyEmailOtp,
	resendEmailOtp,
	refreshTokens,
	logoutUser,
	logoutAllSessions,
	listDeviceSessions,
	revokeDeviceSessions,
	forgotPassword,
	verifyPasswordResetOtp,
	resetPassword,
	type RequestContext,
} from "@/modules/auth/auth.service";

import { auditAuthRegister, auditAuthLogin, auditAuthLogout, auditPasswordReset } from "@/modules/audit/audit.service";

import {
	type RegisterInput,
	type LoginInput,
	type VerifyEmailInput,
	type ResendOtpInput,
} from "@/modules/auth/auth.types";

import type { RefreshBody, LogoutBody, LogoutAllBody } from "@/modules/auth/auth.validators";

/**
 * Centralized request context extraction
 */
const getRequestContext = (req: Request): RequestContext => ({
	ip: req.ip ?? null,
	userAgent: req.get("user-agent") ?? null,
	deviceId: (req.get("x-device-id") ?? "").trim() || null,
	deviceName: (req.get("x-device-name") ?? "").trim() || null,
	appClient: (req.get("x-app-client") ?? "").trim() || null,
	correlationId: (req as any).correlationId ?? null,
});

// ============================================================
// REGISTER
// ============================================================

export const handleRegister = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const payload = req.body as RegisterInput;
	const ctx = getRequestContext(req);

	try {
		const result = await registerUser(payload, ctx);

		await auditAuthRegister({
			status: AuditStatus.SUCCESS,
			userId: null,
			email: payload.email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: "REGISTER_REQUEST_OK",
		});

		res.status(StatusCodes.CREATED).json({ success: true, data: result });
	} catch (err: any) {
		await auditAuthRegister({
			status: AuditStatus.FAIL,
			userId: null,
			email: payload.email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: err?.code ?? err?.message ?? "REGISTER_REQUEST_FAILED",
		});
		throw err;
	}
});

// ============================================================
// VERIFY EMAIL OTP
// ============================================================

export const handleVerifyEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const payload = req.body as VerifyEmailInput;
	const ctx = getRequestContext(req);

	try {
		const result = await verifyEmailOtp(
			{
				email: payload.email,
				code: payload.code,
				purpose: payload.purpose ?? "REGISTER",
			},
			ctx
		);

		if ((payload.purpose ?? "REGISTER") === "REGISTER") {
			await auditAuthRegister({
				status: AuditStatus.SUCCESS,
				userId: result.user.id,
				email: payload.email,
				ip: ctx.ip,
				userAgent: ctx.userAgent,
				correlationId: ctx.correlationId,
				reason: "EMAIL_VERIFIED_TOKENS_ISSUED",
			});
		}

		res.status(StatusCodes.OK).json({ success: true, data: result });
	} catch (err: any) {
		if ((payload.purpose ?? "REGISTER") === "REGISTER") {
			await auditAuthRegister({
				status: AuditStatus.FAIL,
				userId: null,
				email: payload.email,
				ip: ctx.ip,
				userAgent: ctx.userAgent,
				correlationId: ctx.correlationId,
				reason: err?.code ?? err?.message ?? "VERIFY_EMAIL_FAILED",
			});
		}
		throw err;
	}
});

// ============================================================
// RESEND OTP (Cooldown + Cap)
// Not audited by design
// ============================================================

export const handleResendOtp = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const payload = req.body as ResendOtpInput;
	const ctx = getRequestContext(req);

	const result = await resendEmailOtp(
		{
			email: payload.email,
			purpose: payload.purpose ?? "REGISTER",
		},
		ctx
	);

	res.status(StatusCodes.OK).json({ success: true, data: result });
});

// ============================================================
// LOGIN
// ============================================================

export const handleLogin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const payload = req.body as LoginInput;
	const ctx = getRequestContext(req);

	try {
		const result = await loginUser(payload, ctx);

		await auditAuthLogin({
			status: AuditStatus.SUCCESS,
			userId: result.user.id,
			email: payload.email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: "LOGIN_SUCCESS",
		});

		res.status(StatusCodes.OK).json({ success: true, data: result });
	} catch (err: any) {
		await auditAuthLogin({
			status: AuditStatus.FAIL,
			userId: null,
			email: payload.email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: err?.code ?? err?.message ?? "LOGIN_FAILED",
		});
		throw err;
	}
});

// ============================================================
// ME
// ============================================================

export const handleMe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	if (!req.user) {
		res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: "Unauthorized" });
		return;
	}

	const user = await prisma.user.findUnique({
		where: { id: req.user.id },
		select: {
			id: true,
			email: true,
			firstName: true,
			lastName: true,
			role: true,
			emailVerified: true,
			activeBusinessId: true,
		},
	});

	if (!user) {
		res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: "Unauthorized" });
		return;
	}

	let activeBusiness: {
		id: string;
		name: string;
		businessType: unknown;
		countryCode: string;
		currencyCode: string;
		timezone: string;
		settings: unknown;
	} | null = null;

	let defaultStore: { id: string; name: string; code: string | null; isDefault: boolean } | null = null;

	let staffMembership: { id: string; businessId: string; staffRole: unknown; isPrimary: boolean } | null = null;

	if (user.activeBusinessId) {
		activeBusiness = await prisma.business.findUnique({
			where: { id: user.activeBusinessId },
			select: {
				id: true,
				name: true,
				businessType: true,
				countryCode: true,
				currencyCode: true,
				timezone: true,
				settings: true,
			},
		});

		defaultStore = await prisma.store.findFirst({
			where: { businessId: user.activeBusinessId, isDefault: true },
			select: { id: true, name: true, code: true, isDefault: true },
		});

		staffMembership = await prisma.staffMembership.findUnique({
			where: {
				userId_businessId: {
					userId: user.id,
					businessId: user.activeBusinessId,
				},
			},
			select: { id: true, businessId: true, staffRole: true, isPrimary: true },
		});
	}

	res.status(StatusCodes.OK).json({
		success: true,
		data: {
			user: {
				id: user.id,
				email: user.email ?? null,
				firstName: user.firstName,
				lastName: user.lastName,
				role: user.role,
				emailVerified: user.emailVerified,
				activeBusinessId: user.activeBusinessId ?? null,
			},
			activeBusiness,
			defaultStore,
			staffMembership,
		},
	});
});

// ============================================================
// REFRESH
// ============================================================

export const handleRefresh = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const payload = req.body as RefreshBody;
	const result = await refreshTokens(payload.refreshToken, getRequestContext(req));

	res.status(StatusCodes.OK).json({ success: true, data: result });
});

// ============================================================
// LOGOUT
// ============================================================

export const handleLogout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	if (!req.user) {
		res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: "Unauthorized" });
		return;
	}

	const payload = req.body as LogoutBody;
	const ctx = getRequestContext(req);

	try {
		// refreshToken is optional by validator; service is idempotent.
		await logoutUser(req.user.id, payload.refreshToken ?? "", ctx);

		await auditAuthLogout({
			status: AuditStatus.SUCCESS,
			userId: req.user.id,
			email: req.user.email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: "LOGOUT_SUCCESS",
		});

		res.status(StatusCodes.OK).json({ success: true, message: "Logged out successfully" });
	} catch (err: any) {
		await auditAuthLogout({
			status: AuditStatus.FAIL,
			userId: req.user.id,
			email: req.user.email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: err?.code ?? err?.message ?? "LOGOUT_FAILED",
		});
		throw err;
	}
});

// ============================================================
// LOGOUT ALL
// ============================================================

export const handleLogoutAll = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	if (!req.user) {
		res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: "Unauthorized" });
		return;
	}

	// Body is validated as {}. Keep it typed for clarity and future-proofing.
	req.body as LogoutAllBody;

	const ctx = getRequestContext(req);

	try {
		await logoutAllSessions(req.user.id, ctx);

		await auditAuthLogout({
			status: AuditStatus.SUCCESS,
			userId: req.user.id,
			email: req.user.email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: "LOGOUT_ALL_SUCCESS",
		});

		res.status(StatusCodes.OK).json({ success: true, message: "All sessions revoked successfully" });
	} catch (err: any) {
		await auditAuthLogout({
			status: AuditStatus.FAIL,
			userId: req.user.id,
			email: req.user.email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: err?.code ?? err?.message ?? "LOGOUT_ALL_FAILED",
		});
		throw err;
	}
});

// ============================================================
// DEVICE SESSIONS
// ============================================================

export const handleListDevices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	if (!req.user) {
		res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: "Unauthorized" });
		return;
	}

	const devices = await listDeviceSessions(req.user.id, getRequestContext(req));
	res.status(StatusCodes.OK).json({
		success: true,
		data: {
			maxDevices: env.authMaxDevicesPerUser,
			activeDeviceCount: devices.length,
			devices,
		},
	});
});

export const handleRevokeDevice = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	if (!req.user) {
		res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: "Unauthorized" });
		return;
	}

	const deviceId = String(req.params.deviceId ?? "").trim();
	const result = await revokeDeviceSessions(req.user.id, deviceId, getRequestContext(req));
	disconnectRealtimeConnectionsForDevice(req.user.id, deviceId);
	res.status(StatusCodes.OK).json({ success: true, data: result });
});

// ============================================================
// FORGOT / RESET PASSWORD (Audited)
// ============================================================

export const handleForgotPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { email } = req.body as { email: string };
	const ctx = getRequestContext(req);

	try {
		const result = await forgotPassword({ email }, ctx);

		await auditPasswordReset({
			status: AuditStatus.SUCCESS,
			userId: null,
			email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: "FORGOT_PASSWORD_REQUEST_OK",
		});

		res.status(StatusCodes.OK).json({ success: true, data: result });
	} catch (err: any) {
		await auditPasswordReset({
			status: AuditStatus.FAIL,
			userId: null,
			email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: err?.code ?? err?.message ?? "FORGOT_PASSWORD_REQUEST_FAILED",
		});
		throw err;
	}
});

export const handleVerifyPasswordResetOtp = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { email, code } = req.body as { email: string; code: string };
	const ctx = getRequestContext(req);

	try {
		const result = await verifyPasswordResetOtp({ email, code }, ctx);

		await auditPasswordReset({
			status: AuditStatus.SUCCESS,
			userId: null,
			email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: "RESET_TICKET_ISSUED",
		});

		res.status(StatusCodes.OK).json({ success: true, data: result });
	} catch (err: any) {
		await auditPasswordReset({
			status: AuditStatus.FAIL,
			userId: null,
			email,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: err?.code ?? err?.message ?? "VERIFY_PASSWORD_RESET_OTP_FAILED",
		});
		throw err;
	}
});

export const handleResetPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { resetTicket, newPassword } = req.body as { resetTicket: string; newPassword: string };
	const ctx = getRequestContext(req);

	try {
		const result = await resetPassword({ resetTicket, newPassword }, ctx);

		await auditPasswordReset({
			status: AuditStatus.SUCCESS,
			userId: null,
			email: null,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: "PASSWORD_RESET_SUCCESS",
		});

		res.status(StatusCodes.OK).json({ success: true, data: result });
	} catch (err: any) {
		await auditPasswordReset({
			status: AuditStatus.FAIL,
			userId: null,
			email: null,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
			correlationId: ctx.correlationId,
			reason: err?.code ?? err?.message ?? "RESET_PASSWORD_FAILED",
		});
		throw err;
	}
});
