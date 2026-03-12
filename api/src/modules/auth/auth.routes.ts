// path: src/modules/auth/auth.routes.ts

import { Router } from "express";
import {
	handleRegister,
	handleVerifyEmail,
	handleResendOtp,
	handleLogin,
	handleMe,
	handleRefresh,
	handleLogout,
	handleLogoutAll,
	handleListDevices,
	handleRevokeDevice,
	handleForgotPassword,
	handleVerifyPasswordResetOtp,
	handleResetPassword,
} from "@/modules/auth/auth.controller";
import { authMiddleware } from "@/core/middleware/auth";
import { validateBody } from "@/shared/middleware/validateBody";
import {
	registerSchema,
	loginSchema,
	verifyEmailSchema,
	resendOtpSchema,
	forgotPasswordSchema,
	verifyPasswordResetOtpSchema,
	resetPasswordSchema,
	refreshSchema,
	logoutSchema,
	logoutAllSchema,
} from "@/modules/auth/auth.validators";
import {
	loginRateLimiter,
	registerRateLimiter,
	refreshRateLimiter,
	verifyEmailRateLimiter,
	resendOtpRateLimiter,
	forgotPasswordRateLimiter,
	verifyPasswordResetRateLimiter,
	resetPasswordRateLimiter,
} from "@/core/middleware/rateLimiter";

const router = Router();

// Public auth endpoints
router.post("/register", registerRateLimiter, validateBody(registerSchema), handleRegister);

// Verify Email OTP -> issues tokens (first mint)
router.post("/verify-email", verifyEmailRateLimiter, validateBody(verifyEmailSchema), handleVerifyEmail);

// Resend OTP -> cooldown + caps (rate limiter + server-side cap)
router.post("/resend-otp", resendOtpRateLimiter, validateBody(resendOtpSchema), handleResendOtp);

router.post("/login", loginRateLimiter, validateBody(loginSchema), handleLogin);

// Refresh tokens (validated)
router.post("/refresh", refreshRateLimiter, validateBody(refreshSchema), handleRefresh);

// Password reset (NEW)
router.post("/forgot-password", forgotPasswordRateLimiter, validateBody(forgotPasswordSchema), handleForgotPassword);

router.post(
	"/verify-password-reset-otp",
	verifyPasswordResetRateLimiter,
	validateBody(verifyPasswordResetOtpSchema),
	handleVerifyPasswordResetOtp
);

router.post("/reset-password", resetPasswordRateLimiter, validateBody(resetPasswordSchema), handleResetPassword);

// Protected endpoints
router.get("/me", authMiddleware, handleMe);
router.get("/devices", authMiddleware, handleListDevices);

// Logout endpoints (validated)
router.post("/logout", authMiddleware, validateBody(logoutSchema), handleLogout);
router.post("/logout-all", authMiddleware, validateBody(logoutAllSchema), handleLogoutAll);
router.post("/devices/:deviceId/revoke", authMiddleware, handleRevokeDevice);

export { router as authRoutes };
