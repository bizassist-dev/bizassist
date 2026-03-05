// path: app/(auth)/verify-email.tsx
// ✅ Fix (native-thread): resend timer label will NOT freeze when keyboard is open.
// ✅ Fix Reanimated warning: never read sharedValue.value during render.
// ✅ Flash fixes:
//   1) Hard-set backgroundColor on wrappers exposed during iOS keyboard transitions.
//   2) Resend label is now a SINGLE, fixed-width, UI-thread-driven text node (no spinner, no layout swaps).
//
// 🔒 Governance:
// - Loading Overlay already exists via withBusy → remove resend spinner/UI branching.
// - Remove resend-button layout churn: the label is always present and always the same measured width.
// - Avoid micro “blink” caused by variable-width digits by using tabular numbers (monospaced digits).
//
// ✅ UI-shift fix (OTP cells):
// - Hide caret + disable selection/menu to prevent iOS compositor “digit shift” while typing.
// - Use tabular numbers + Android monospace fallback for stable glyph widths.
// - No layout changes. No feature changes.

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	TextInput as RNTextInput,
	StyleSheet,
	TextInput,
	View,
} from "react-native";
import { useTheme } from "react-native-paper";
import Animated, {
	Easing,
	cancelAnimation,
	useAnimatedProps,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

import { useAppBusy } from "@/hooks/useAppBusy";

import { BAIButton } from "@/components/ui/BAIButton";
import { BAICTAButton } from "@/components/ui/BAICTAButton";
import { BAICard } from "@/components/ui/BAICard";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAIText } from "@/components/ui/BAIText";
import { Shield } from "@/components/ui/Shield";

import { useAuth } from "@/modules/auth/AuthContext";
import { authApi } from "@/modules/auth/auth.api";
import type { AuthDomainError } from "@/modules/auth/auth.errors";
import { mapAuthErrorToMessage } from "@/modules/auth/auth.errors";
import { savePasswordResetTicket, setPostVerifyEmail } from "@/modules/auth/auth.storage";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import { sanitizeEmailInput } from "@/shared/validation/sanitize";

type Params = {
	email?: string;
	purpose?: "REGISTER" | "PASSWORD_RESET" | "CHANGE_EMAIL";
	cooldownSeconds?: string;
	expiresInSeconds?: string;
};

const OTP_LENGTH = FIELD_LIMITS.otpCode;
const CONTENT_MAX_WIDTH = 640;
const CELL_SIZE = 46;

// Enough to fit: "Resend in 3600s"
const RESEND_LABEL_MIN_WIDTH = 180;

function clampInt(value: unknown, fallback: number, min = 0, max = 60 * 60): number {
	const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, Math.floor(n)));
}

function pickCooldownSeconds(res: unknown, fallback: number): number {
	const r = res as { cooldownSecondsRemaining?: unknown; cooldownSeconds?: unknown } | null | undefined;

	const remaining = clampInt(r?.cooldownSecondsRemaining, -1, 0, 60 * 60);
	if (remaining >= 0) return remaining;

	const full = clampInt(r?.cooldownSeconds, -1, 0, 60 * 60);
	if (full >= 0) return full;

	return clampInt(fallback, 0, 0, 60 * 60);
}

function onlyDigit(value: string): string {
	return value.replace(/\D/g, "");
}

function digitsToCode(digits: string[]): string {
	return digits.join("").replace(/\D/g, "").slice(0, OTP_LENGTH);
}

function useKeyboardVisible({ onShow, onHide }: { onShow?: () => void; onHide?: () => void } = {}) {
	useEffect(() => {
		const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
		const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

		const s1 = Keyboard.addListener(showEvent, () => onShow?.());
		const s2 = Keyboard.addListener(hideEvent, () => onHide?.());

		return () => {
			s1.remove();
			s2.remove();
		};
	}, [onHide, onShow]);
}

/**
 * Countdown state for business logic (button enablement).
 * JS-driven is fine for canResend; label is UI-thread driven below.
 */
function useCooldownSeconds(initialSeconds: number) {
	const [secondsLeft, setSecondsLeft] = useState<number>(Math.max(0, initialSeconds));
	const targetMsRef = useRef<number>(Date.now() + Math.max(0, initialSeconds) * 1000);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const computeLeft = useCallback(() => {
		const msLeft = targetMsRef.current - Date.now();
		if (msLeft <= 0) return 0;
		return Math.max(0, Math.ceil(msLeft / 1000));
	}, []);

	const stop = useCallback(() => {
		if (intervalRef.current) clearInterval(intervalRef.current);
		intervalRef.current = null;
	}, []);

	const seed = useCallback(
		(seconds: number) => {
			const s = clampInt(seconds, 0, 0, 60 * 60);
			targetMsRef.current = Date.now() + s * 1000;
			setSecondsLeft(s);

			stop();
			if (s <= 0) return;

			intervalRef.current = setInterval(() => {
				const next = computeLeft();
				setSecondsLeft(next);
				if (next <= 0) stop();
			}, 1000);
		},
		[computeLeft, stop],
	);

	const sync = useCallback(() => {
		setSecondsLeft(computeLeft());
	}, [computeLeft]);

	useEffect(() => {
		seed(initialSeconds);
		return stop;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return { secondsLeft, seed, sync, stop, targetMsRef };
}

/**
 * ✅ UI-thread countdown label (Reanimated) rendered via Animated TextInput.
 * Refactor for zero layout shift:
 * - Single, fixed-width container.
 * - Fixed "Resend in " prefix with tabular-number digits (monospaced digits) for the countdown.
 * - No spinner, no conditional rendering inside the button.
 */
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const ResendCountdownLabel = memo(function ResendCountdownLabel({
	seedSeconds,
	seedKey,
	enabledLabel,
	disabledPrefix,
	style,
}: {
	seedSeconds: number;
	seedKey: number;
	enabledLabel: string;
	disabledPrefix: string;
	style?: any;
}) {
	const durationSec = useSharedValue(0);
	const progress = useSharedValue(1);

	// Stable initial string; animatedProps will take over.
	const initialRef = useRef(
		seedSeconds > 0 ? `${disabledPrefix} ${Math.max(0, Math.floor(seedSeconds))}s` : enabledLabel,
	);

	useEffect(() => {
		const s = Math.max(0, Math.floor(seedSeconds));
		durationSec.value = s;

		cancelAnimation(progress);

		if (s <= 0) {
			progress.value = 1;
			return;
		}

		progress.value = 0;
		progress.value = withTiming(1, { duration: s * 1000, easing: Easing.linear });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seedKey]);

	const animatedProps = useAnimatedProps(() => {
		const s = durationSec.value;

		if (s <= 0) {
			return { text: enabledLabel } as any;
		}

		const left = Math.max(0, Math.ceil((1 - progress.value) * s));

		// Pad to 2 digits to avoid width jitter for 9->10 transitions.
		// Keep overall string format stable.
		const leftStr = left < 10 ? `0${left}` : `${left}`;
		const label = left <= 0 ? enabledLabel : `${disabledPrefix} ${leftStr}s`;

		return { text: label } as any;
	}, [enabledLabel, disabledPrefix]);

	return (
		<AnimatedTextInput
			editable={false}
			scrollEnabled={false}
			underlineColorAndroid='transparent'
			pointerEvents='none'
			defaultValue={initialRef.current}
			animatedProps={animatedProps}
			style={style}
		/>
	);
});

export default function VerifyEmailScreen() {
	const router = useRouter();
	const theme = useTheme();
	const { verifyEmail, resendOtp } = useAuth();
	const { withBusy } = useAppBusy();
	const params = useLocalSearchParams<Params>();

	const bg = theme.colors.background;

	const email = useMemo(() => sanitizeEmailInput((params.email ?? "").toString()), [params.email]);
	const purpose = useMemo(() => ((params.purpose ?? "REGISTER") as Params["purpose"]) || "REGISTER", [params.purpose]);

	const initialCooldown = useMemo(() => clampInt(params.cooldownSeconds, 0, 0, 60 * 10), [params.cooldownSeconds]);

	const [digits, setDigits] = useState<string[]>(Array.from({ length: OTP_LENGTH }, () => ""));
	const [focusedIndex, setFocusedIndex] = useState<number>(0);

	const [isVerifying, setIsVerifying] = useState(false);
	const [isResending, setIsResending] = useState(false);
	const [globalError, setGlobalError] = useState("");
	const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

	const inputsRef = useRef<(RNTextInput | null)[]>([]);

	const { secondsLeft: cooldownLeft, seed: seedCooldown, sync: syncCooldown } = useCooldownSeconds(initialCooldown);

	// ✅ Seed key + seed seconds for UI-thread label restarts
	const [cooldownSeedKey, setCooldownSeedKey] = useState(0);
	const [cooldownSeedSeconds, setCooldownSeedSeconds] = useState<number>(Math.max(0, initialCooldown));

	const seedCooldownAll = useCallback(
		(seconds: number) => {
			const s = clampInt(seconds, 0, 0, 60 * 60);
			seedCooldown(s);
			setCooldownSeedSeconds(s);
			setCooldownSeedKey((k) => k + 1);
		},
		[seedCooldown],
	);

	// Keep business logic accurate on keyboard transitions
	useKeyboardVisible({ onShow: syncCooldown, onHide: syncCooldown });

	useEffect(() => {
		seedCooldownAll(initialCooldown);
	}, [initialCooldown, seedCooldownAll]);

	const canResend = cooldownLeft <= 0;
	const code = useMemo(() => digitsToCode(digits), [digits]);
	const canVerify = !!email && code.length === OTP_LENGTH;

	const otpTextColor = theme.colors.onSurface;
	const otpBg = theme.colors.surfaceVariant;
	const otpBorderIdle = theme.colors.outline;
	const otpBorderActive = theme.colors.primary;
	const otpPlaceholder = theme.colors.onSurfaceVariant;

	const title = purpose === "PASSWORD_RESET" ? "Verify Code" : "Verify Email";
	const subtitle =
		purpose === "PASSWORD_RESET"
			? `Enter the 6-digit code sent to ${email || "your email"} to reset your password.`
			: `Enter the 6-digit code sent to ${email || "your email"}.`;

	const focusIndex = useCallback((idx: number) => {
		const clamped = Math.max(0, Math.min(OTP_LENGTH - 1, idx));
		setFocusedIndex(clamped);
		inputsRef.current[clamped]?.focus?.();
	}, []);

	const setDigitAt = useCallback((idx: number, nextDigit: string) => {
		setDigits((prev) => {
			const copy = [...prev];
			copy[idx] = nextDigit;
			return copy;
		});
	}, []);

	const clearAllDigits = useCallback(() => {
		setDigits(Array.from({ length: OTP_LENGTH }, () => ""));
		setFocusedIndex(0);
	}, []);

	const handleChangeAt = useCallback(
		(idx: number, raw: string) => {
			setGlobalError("");
			const cleaned = onlyDigit(raw);

			if (cleaned.length > 1) {
				const chars = cleaned.slice(0, OTP_LENGTH).split("");
				setDigits(() => Array.from({ length: OTP_LENGTH }, (_, i) => chars[i] ?? ""));
				const nextFocus = Math.min(cleaned.length, OTP_LENGTH) - 1;
				focusIndex(nextFocus);
				return;
			}

			const digit = cleaned.slice(-1);
			setDigitAt(idx, digit);

			if (digit && idx < OTP_LENGTH - 1) focusIndex(idx + 1);
		},
		[focusIndex, setDigitAt],
	);

	const handleKeyPressAt = useCallback(
		(idx: number, key: string) => {
			if (key !== "Backspace") return;

			if (!digits[idx]) {
				if (idx > 0) {
					setDigitAt(idx - 1, "");
					focusIndex(idx - 1);
				}
				return;
			}

			setDigitAt(idx, "");
		},
		[digits, focusIndex, setDigitAt],
	);

	const handleVerify = useCallback(async () => {
		if (isVerifying) return;
		setGlobalError("");

		if (!email) {
			setGlobalError("Missing email. Please go back and try again.");
			return;
		}

		if (code.length !== OTP_LENGTH) {
			setGlobalError("Please enter the 6-digit code.");
			return;
		}

		try {
			setIsVerifying(true);

			await withBusy("Verifying code…", async () => {
				if (purpose === "PASSWORD_RESET") {
					const res = await authApi.verifyPasswordResetOtp({ email, code });

					savePasswordResetTicket({
						email,
						resetTicket: res.resetTicket,
						expiresInSeconds: res.expiresInSeconds,
					});

					router.replace("/(auth)/reset-password");
					return;
				}

				await verifyEmail({ email, purpose, code });

				setPostVerifyEmail(email);
				setVerifiedEmail(email);
			});
		} catch (err) {
			const e = err as AuthDomainError;
			setGlobalError(mapAuthErrorToMessage(e));
		} finally {
			setIsVerifying(false);
		}
	}, [code, email, isVerifying, purpose, router, verifyEmail, withBusy]);

	const handleResend = useCallback(async () => {
		setGlobalError("");

		if (!email) {
			setGlobalError("Missing email. Please go back and try again.");
			return;
		}

		if (isResending) return;
		if (!canResend) return;

		const fallbackCooldown = initialCooldown > 0 ? initialCooldown : 60;

		try {
			setIsResending(true);

			// Optimistic seed so button flips immediately (and UI-thread label restarts)
			seedCooldownAll(fallbackCooldown);

			const res = await withBusy("Sending code…", async () => {
				return await resendOtp({ email, purpose });
			});

			seedCooldownAll(pickCooldownSeconds(res, fallbackCooldown));

			clearAllDigits();
			focusIndex(0);
		} catch (err) {
			const e = err as AuthDomainError;
			setGlobalError(mapAuthErrorToMessage(e));
			seedCooldownAll(0);
		} finally {
			setIsResending(false);
		}
	}, [
		canResend,
		clearAllDigits,
		email,
		focusIndex,
		initialCooldown,
		isResending,
		purpose,
		resendOtp,
		seedCooldownAll,
		withBusy,
	]);

	if (verifiedEmail) {
		const safeEmail = encodeURIComponent(verifiedEmail);
		return <Redirect href={`/(auth)/verify-success?email=${safeEmail}`} />;
	}

	// ✅ Title color governance for the primary "Verify Code" button:
	// - Enabled/default: light title (on primary background).
	// - Disabled: dark title (explicit requirement).
	const verifyTitleColor = theme.colors.onPrimary;

	return (
		<View style={[styles.root, { backgroundColor: bg }]}>
			<BAIScreen
				padded={false}
				scroll
				style={{ backgroundColor: bg } as any}
				contentContainerStyle={{ flexGrow: 1, paddingBottom: 24, backgroundColor: bg }}
			>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : undefined}
					style={[styles.flexGrow, { backgroundColor: bg }]}
					keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
				>
					<View style={[styles.outer, { backgroundColor: bg }]}>
						<View style={styles.container}>
							<BAICard style={styles.card}>
								<View style={styles.header}>
									<Shield
										size='lg'
										backgroundColor='#d7e5feff'
										iconColor='#639fffff'
										style={styles.shield}
										iconName='shield-half-full'
									/>

									<BAIText variant='title'>{title}</BAIText>

									<BAIText variant='body' muted style={styles.subtitle}>
										{subtitle}
									</BAIText>
								</View>

								<View style={styles.form}>
									<Pressable onPress={() => focusIndex(0)} style={styles.otpRow}>
										{Array.from({ length: OTP_LENGTH }).map((_, idx) => {
											const isFocused = focusedIndex === idx;
											const filled = !!digits[idx];

											return (
												<RNTextInput
													key={idx}
													ref={(r) => {
														inputsRef.current[idx] = r;
													}}
													value={digits[idx]}
													onFocus={() => setFocusedIndex(idx)}
													onChangeText={(t) => handleChangeAt(idx, t)}
													onKeyPress={({ nativeEvent }) => handleKeyPressAt(idx, nativeEvent.key)}
													keyboardType='number-pad'
													returnKeyType={idx === OTP_LENGTH - 1 ? "done" : "next"}
													textContentType='oneTimeCode'
													autoComplete='sms-otp'
													autoCorrect={false}
													autoCapitalize='none'
													selectionColor={theme.colors.primary}
													placeholder={filled ? "" : "•"}
													placeholderTextColor={otpPlaceholder}
													maxLength={Platform.OS === "android" ? FIELD_LIMITS.otpCellAndroid : FIELD_LIMITS.otpCell}
													style={[
														styles.otpCell,
														{
															backgroundColor: otpBg,
															borderColor: isFocused ? otpBorderActive : otpBorderIdle,
															color: otpTextColor,
														},
													]}
													onSubmitEditing={idx === OTP_LENGTH - 1 ? handleVerify : undefined}
													// ✅ UI shifting fix while typing (caret/selection compositor)
													caretHidden
													contextMenuHidden
													selectTextOnFocus={false}
													selection={{ start: 0, end: 0 }}
												/>
											);
										})}
									</Pressable>

									<View style={styles.errorArea}>
										{!!globalError && (
											<BAIText variant='caption' style={{ color: theme.colors.error }}>
												{globalError}
											</BAIText>
										)}
									</View>

									<BAICTAButton onPress={handleVerify} disabled={isVerifying || !canVerify} size='lg'>
										<BAIText variant='body' style={[styles.primaryButtonText, { color: verifyTitleColor }]}>
											Verify Code
										</BAIText>
									</BAICTAButton>

									<View style={styles.resendRow}>
										<BAIButton
											onPress={handleResend}
											disabled={!canResend || isResending}
											variant='outline'
											intent='primary'
											size='lg'
										>
											<View style={styles.resendLabelShell}>
												<ResendCountdownLabel
													seedSeconds={cooldownSeedSeconds}
													seedKey={cooldownSeedKey}
													enabledLabel='Resend Code'
													disabledPrefix='Resend In'
													style={[
														styles.countdownTextInput,
														styles.secondaryButtonText,
														{ color: theme.colors.onSurface },
													]}
												/>
											</View>
										</BAIButton>
									</View>
								</View>
							</BAICard>
						</View>
					</View>
				</KeyboardAvoidingView>
			</BAIScreen>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	flexGrow: { flexGrow: 1 },

	outer: {
		flexGrow: 1,
		justifyContent: "center",
		paddingHorizontal: 16,
		paddingVertical: 24,
	},

	container: {
		width: "100%",
		maxWidth: CONTENT_MAX_WIDTH,
		alignSelf: "center",
	},

	card: { padding: 16 },

	header: { gap: 8, marginBottom: 12, alignItems: "center" },
	shield: { marginBottom: 2 },
	subtitle: { lineHeight: 20, textAlign: "center" },

	form: { gap: 12 },

	otpRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 2 },

	otpCell: {
		width: CELL_SIZE,
		height: CELL_SIZE,
		borderWidth: 1.5,
		borderRadius: 10,
		textAlign: "center",
		fontSize: 18,
		fontWeight: "800",
		paddingVertical: 0,
		includeFontPadding: false,
		textAlignVertical: "center",

		// ✅ Stabilize numeric glyph widths (prevents “1 vs 9” perceived jitter)
		fontVariant: ["tabular-nums"],
		fontFamily: Platform.OS === "android" ? "monospace" : undefined,
	},

	errorArea: { minHeight: 18, justifyContent: "center", alignItems: "center" },

	primaryButtonText: { fontWeight: "500", textAlign: "center" },
	secondaryButtonText: { fontWeight: "500", textAlign: "center" },

	resendRow: { marginTop: 4 },

	// ✅ Fixed width container so the button never reflows
	resendLabelShell: {
		minWidth: RESEND_LABEL_MIN_WIDTH,
		alignItems: "center",
		justifyContent: "center",
	},

	// Make TextInput look like text (no padding, no border) + lock numeric glyph widths
	countdownTextInput: {
		padding: 0,
		margin: 0,
		borderWidth: 0,
		backgroundColor: "transparent",
		includeFontPadding: false,
		textAlign: "center",

		// iOS: stabilize digit widths (prevents 1/0/etc. width jitter)
		fontVariant: ["tabular-nums"],

		// Android: best-effort monospace fallback for numeric stability
		// (fontVariant is supported on Android too, but this helps on some OEM fonts)
		fontFamily: Platform.OS === "android" ? "monospace" : undefined,
	},
});
