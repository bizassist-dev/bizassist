// BizAssist_mobile path: app/(auth)/login.tsx
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { TextInput, useTheme } from "react-native-paper";

import { useAppBusy } from "@/hooks/useAppBusy";
import { useAuth } from "@/modules/auth/AuthContext";

import { BAIButton } from "@/components/ui/BAIButton";
import { BAICTAButton } from "@/components/ui/BAICTAButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAITextInput } from "@/components/ui/BAITextInput";

import { AuthDomainError, getAuthHelperText, mapAuthErrorToMessage } from "@/modules/auth/auth.errors";
import { validateEmail, validatePasswordForLogin } from "@/modules/auth/auth.validation";

import { FIELD_LIMITS } from "@/shared/fieldLimits";
import { sanitizeEmailInput } from "@/shared/validation/sanitize";
import Logo from "../../assets/images/BizAssist-logo.png";

type LoginFormValues = {
	email: string;
	password: string;
};

export default function LoginScreen() {
	const router = useRouter();
	const { login, isBootstrapping, isAuthenticated } = useAuth();
	const { withBusy } = useAppBusy();
	const theme = useTheme();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [helperText, setHelperText] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

	const submitLockRef = useRef(false);

	const navLockRef = useRef(false);
	const [isNavLocked, setIsNavLocked] = useState(false);

	const isBusy = isSubmitting || isBootstrapping;
	const isRouteLocked = isBusy || isNavLocked;

	const lockNav = (ms = 700) => {
		if (navLockRef.current) return false;
		navLockRef.current = true;
		setIsNavLocked(true);

		setTimeout(() => {
			navLockRef.current = false;
			setIsNavLocked(false);
		}, ms);

		return true;
	};

	const clearFieldError = useCallback((field: string) => {
		setFieldErrors((prev) => {
			if (!prev[field]) return prev;
			const next = { ...prev };
			delete next[field];
			return next;
		});
	}, []);

	const validate = useCallback((values: LoginFormValues) => {
		const errors: Record<string, string> = {};

		const emailError = validateEmail(values.email);
		if (emailError) errors.email = emailError;

		const passwordError = validatePasswordForLogin(values.password);
		if (passwordError) errors.password = passwordError;

		setFieldErrors(errors);
		return Object.keys(errors).length === 0;
	}, []);

	const sanitizedValues = useMemo<LoginFormValues>(
		() => ({
			email: sanitizeEmailInput(email),
			password,
		}),
		[email, password],
	);

	const handleSubmit = async () => {
		if (isBusy) return;

		if (submitLockRef.current) return;

		setError(null);
		setHelperText(null);
		setEmail(sanitizedValues.email);

		if (!validate(sanitizedValues)) return;

		submitLockRef.current = true;
		setIsSubmitting(true);

		try {
			await withBusy("Signing you in…", async () => {
				await login({
					email: sanitizedValues.email,
					password: sanitizedValues.password,
				});
			});

			router.replace("/(system)/bootstrap");
		} catch (err: any) {
			if (err && (err as AuthDomainError).code) {
				const typed = err as AuthDomainError;

				if (typed.fieldErrors) {
					setFieldErrors((prev) => ({
						...prev,
						...typed.fieldErrors,
					}));
				}

				if (typed.code === "EMAIL_VERIFICATION_REQUIRED") {
					setError("Email verification required");

					const safeEmail = sanitizeEmailInput(typed.email ?? sanitizedValues.email);
					const safePurpose = (typed.purpose ?? "REGISTER") as any;

					const cooldown =
						typeof typed.cooldownSecondsRemaining === "number"
							? typed.cooldownSecondsRemaining
							: typeof typed.cooldownSeconds === "number"
								? typed.cooldownSeconds
								: 0;

					const expires = typeof typed.expiresInSeconds === "number" ? typed.expiresInSeconds : 0;

					router.replace({
						pathname: "/(auth)/verify-email",
						params: {
							email: safeEmail,
							purpose: safePurpose,
							cooldownSeconds: String(cooldown),
							expiresInSeconds: String(expires),
						},
					});
					return;
				}

				if (typed.code === "VALIDATION_ERROR") {
					setError(null);
					setHelperText(null);
				} else {
					setError(mapAuthErrorToMessage(typed));
					setHelperText(getAuthHelperText(typed));
				}
			} else {
				const message =
					err?.response?.data?.message ?? err?.message ?? "Login failed. Please check your credentials and try again.";
				setError(message);
				setHelperText(null);
			}
		} finally {
			setIsSubmitting(false);
			submitLockRef.current = false;
		}
	};

	const handleGoForgotPassword = () => {
		if (isRouteLocked) return;
		if (!lockNav(700)) return;

		router.push({
			pathname: "/(auth)/forgot-password",
			params: { email: sanitizeEmailInput(email) },
		});
	};

	const handleGoRegister = () => {
		if (isRouteLocked) return;
		if (!lockNav(700)) return;

		router.push("/(auth)/register");
	};

	useEffect(() => {
		if (!isBootstrapping && isAuthenticated) {
			router.replace("/(system)/bootstrap");
		}
	}, [isBootstrapping, isAuthenticated, router]);

	/**
	 * ✅ Status bar governance:
	 * - Owned globally by app/_layout.tsx via expo-status-bar.
	 * - Auth screens must NOT re-own StatusBar locally (prevents flicker / dueling ownership).
	 */

	/**
	 * ✅ Title color governance:
	 * - Light mode: dark title
	 * - Dark mode: light title
	 * - No blue branding in auth titles (keeps it neutral and always readable).
	 */
	const appTitleColor = theme.dark ? "rgba(255,255,255,0.92)" : "rgba(17,24,39,0.92)"; // ~gray-900
	const linkColor = theme.dark ? "#93C5FD" : "#2563EB";

	return (
		<KeyboardAvoidingView
			style={styles.kav}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
		>
			<BAIScreen padded={false} scroll contentContainerStyle={styles.scrollContent}>
				<View style={styles.outer}>
					<View style={styles.container}>
						<View style={styles.logoContainer}>
							<Image source={Logo} style={styles.logo} resizeMode='contain' />
							<BAIText variant='subtitle' style={[styles.appTitle, { color: appTitleColor }]}>
								Biz Assist AI
							</BAIText>
						</View>

						<View style={styles.header}>
							<BAIText variant='title'>Welcome back</BAIText>
							<BAIText variant='subtitle' muted>
								Sign in to access your BizAssist AI workspace.
							</BAIText>
						</View>

						<BAISurface style={styles.surface}>
							<View style={styles.form}>
								<View style={styles.errorContainer}>
									{error ? (
										<>
											<BAIText variant='caption' style={styles.errorText}>
												{error}
											</BAIText>
											{helperText ? (
												<BAIText variant='caption' muted>
													{helperText}
												</BAIText>
											) : null}
										</>
									) : null}
								</View>

								<View style={styles.inputGroup}>
									<BAITextInput
										value={email}
										onChangeText={(value) => {
											setEmail(sanitizeEmailInput(value));
											setError(null);
											setHelperText(null);
											clearFieldError("email");
										}}
										autoCapitalize='none'
										keyboardType='email-address'
										autoComplete='email'
										textContentType='emailAddress'
										placeholder='Email'
										maxLength={FIELD_LIMITS.email}
										returnKeyType='next'
										error={!!fieldErrors.email}
									/>
									<View style={styles.fieldErrorContainer}>
										{fieldErrors.email ? (
											<BAIText variant='caption' style={styles.errorText}>
												{fieldErrors.email}
											</BAIText>
										) : null}
									</View>
								</View>

								<View style={styles.inputGroupNoBottom}>
									<BAITextInput
										value={password}
										onChangeText={(value) => {
											setPassword(value);
											setError(null);
											setHelperText(null);
											clearFieldError("password");
										}}
										secureTextEntry={!isPasswordVisible}
										placeholder='Password'
										maxLength={FIELD_LIMITS.password}
										autoCapitalize='none'
										autoComplete='password'
										textContentType='password'
										returnKeyType='done'
										onSubmitEditing={handleSubmit}
										error={!!fieldErrors.password}
										right={
											<TextInput.Icon
												icon={isPasswordVisible ? "eye-off" : "eye"}
												onPress={() => setIsPasswordVisible((v) => !v)}
												forceTextInputFocus={false}
											/>
										}
									/>
									<View style={styles.fieldErrorContainer}>
										{fieldErrors.password ? (
											<BAIText variant='caption' style={styles.errorText}>
												{fieldErrors.password}
											</BAIText>
										) : null}
									</View>
								</View>

								<View style={styles.buttonBlock}>
									<BAICTAButton
										onPress={handleSubmit}
										disabled={isBusy}
										variant='solid'
										intent='primary'
										style={styles.signInBtn}
										contentStyle={styles.signInBtnContent}
										size='lg'
									>
										Sign In
									</BAICTAButton>
								</View>
							</View>

							<View style={styles.secondaryRow}>
								<BAIButton
									onPress={handleGoForgotPassword}
									disabled={isRouteLocked}
									variant='ghost'
									intent='primary'
									size='lg'
								>
									<BAIText variant='caption' style={{ color: linkColor, fontWeight: "700" }}>
										Forgot Password?
									</BAIText>
								</BAIButton>
							</View>
						</BAISurface>

						<View style={styles.createAccountWrap}>
							<BAICTAButton
								onPress={handleGoRegister}
								disabled={isRouteLocked}
								intent='success'
								variant='outline'
								style={styles.createButton}
								contentStyle={styles.createContent}
								size='lg'
							>
								Create New Account
							</BAICTAButton>
						</View>
					</View>
				</View>
			</BAIScreen>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	kav: {
		flex: 1,
	},

	scrollContent: {
		flexGrow: 1,
		paddingBottom: 36,
		marginBottom: 250,
	},

	outer: {
		flexGrow: 1,
		paddingHorizontal: 16,
		paddingTop: 24,
		paddingBottom: 24,
		justifyContent: "flex-start",
	},

	container: {
		width: "100%",
		maxWidth: 720,
		alignSelf: "center",
	},

	logoContainer: {
		width: "100%",
		alignItems: "center",
		marginBottom: 40,
	},
	logo: {
		width: 96,
		height: 96,
		borderRadius: 24,
	},
	appTitle: {
		marginTop: 12,
		textAlign: "center",
	},
	header: { marginBottom: 24 },

	surface: {
		marginBottom: 16,
		width: "100%",
		alignSelf: "center",
	},

	form: { gap: 4 },
	inputGroup: { marginBottom: 2 },
	inputGroupNoBottom: { marginBottom: 0 },
	fieldErrorContainer: {
		minHeight: 14,
		justifyContent: "flex-start",
		marginTop: 2,
	},

	buttonBlock: { marginTop: 16 },

	signInBtn: { width: "100%", borderRadius: 16 },
	signInBtnContent: { height: 56 },

	secondaryRow: { alignItems: "center", marginTop: 12 },
	errorContainer: {
		minHeight: 14,
		marginBottom: 4,
		justifyContent: "center",
		alignItems: "center",
	},
	errorText: { color: "#DC2626" },

	createAccountWrap: { marginTop: 8, alignItems: "center" },
	createButton: { width: "100%" },
	createContent: { height: 56 },
});
