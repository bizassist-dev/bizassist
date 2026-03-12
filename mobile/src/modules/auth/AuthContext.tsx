// BizAssist_mobile
// path: src/modules/auth/AuthContext.tsx

import { authApi } from "@/modules/auth/auth.api";
import { getAuthTokens } from "@/modules/auth/auth.storage";
import {
	applyAuthSession,
	invalidateAuthSession,
	onAuthSessionChange,
	refreshSessionSingleFlight,
} from "@/modules/auth/auth.session";
import type {
	AuthUser,
	LoginPayload,
	RegisterPayload,
	RegisterResponse,
	ResendOtpPayload,
	ResendOtpResponse,
	VerifyEmailPayload,
} from "@/modules/auth/auth.types";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface AuthState {
	user: AuthUser | null;
	accessToken: string | null;
	refreshToken: string | null;
	isBootstrapping: boolean;
}

interface AuthContextValue extends AuthState {
	isAuthenticated: boolean;

	// OTP-first register: returns verification meta for routing
	register: (payload: RegisterPayload) => Promise<RegisterResponse>;

	// Login: tokens if verified, otherwise throws AuthDomainError (EMAIL_VERIFICATION_REQUIRED)
	login: (payload: LoginPayload) => Promise<void>;

	verifyEmail: (payload: VerifyEmailPayload) => Promise<void>;
	resendOtp: (payload: ResendOtpPayload) => Promise<ResendOtpResponse>;

	refreshSession: () => Promise<void>;
	logout: () => Promise<void>;
	logoutAllSessions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export const AuthProvider = ({ children }: { children: ReactNode }) => {
	const [state, setState] = useState<AuthState>({
		user: null,
		accessToken: null,
		refreshToken: null,
		isBootstrapping: true,
	});

	const bootstrap = useCallback(async () => {
		const { refreshToken } = getAuthTokens();
		if (!refreshToken) {
			invalidateAuthSession("bootstrap_no_token");
			return;
		}

		try {
			await refreshSessionSingleFlight();
		} catch {
			if (getAuthTokens().refreshToken === refreshToken) {
				invalidateAuthSession("bootstrap_failed");
			}
		}
	}, []);

	useEffect(() => {
		const unsubscribe = onAuthSessionChange((payload) => {
			if (!payload) {
				setState((prev) => ({
					...prev,
					user: null,
					accessToken: null,
					refreshToken: null,
					isBootstrapping: false,
				}));
				return;
			}

			setState({
				user: payload.user,
				accessToken: payload.tokens.accessToken,
				refreshToken: payload.tokens.refreshToken,
				isBootstrapping: false,
			});
		});

		return unsubscribe;
	}, []);

	useEffect(() => {
		bootstrap();
	}, [bootstrap]);

	const register = useCallback(async (payload: RegisterPayload) => {
		// OTP-first: DO NOT apply session here
		const result = await authApi.register(payload);
		return result;
	}, []);

	const login = useCallback(async (payload: LoginPayload) => {
		const result = await authApi.login(payload);
		applyAuthSession(result, "login");
	}, []);

	const verifyEmail = useCallback(async (payload: VerifyEmailPayload) => {
		const result = await authApi.verifyEmail(payload);
		applyAuthSession(result, "verify_email");
	}, []);

	const resendOtp = useCallback(async (payload: ResendOtpPayload) => {
		return authApi.resendOtp(payload);
	}, []);

	const refreshSession = useCallback(async () => {
		await refreshSessionSingleFlight();
	}, []);

	const logout = useCallback(async () => {
		try {
			if (state.refreshToken) {
				await authApi.logout(state.refreshToken);
			}
		} catch {
			// best-effort
		} finally {
			invalidateAuthSession("logout");
		}
	}, [state.refreshToken]);

	const logoutAllSessions = useCallback(async () => {
		try {
			await authApi.logoutAll();
		} catch {
			// best-effort
		} finally {
			invalidateAuthSession("logout_all");
		}
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({
			...state,
			isAuthenticated: !!state.user && !!state.accessToken,

			register,
			login,

			verifyEmail,
			resendOtp,

			refreshSession,
			logout,
			logoutAllSessions,
		}),
		[state, register, login, verifyEmail, resendOtp, refreshSession, logout, logoutAllSessions],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return ctx;
};
