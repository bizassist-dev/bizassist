// BizAssist_mobile
// path: src/components/ui/BAISwitchRow.tsx

import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Switch, useTheme } from "react-native-paper";

import { BAIText } from "@/components/ui/BAIText";

type BAISwitchRowProps = {
	label: string;
	description?: string;

	value: boolean;
	onValueChange: (next: boolean) => void;

	disabled?: boolean;

	/**
	 * Optional: if you want a tighter row in dense forms.
	 */
	dense?: boolean;

	/**
	 * Optional: choose a built-in ON color preset.
	 * - "green" (default): BizAssist green
	 * - "blue": BizAssist blue
	 * Note: `switchColor` (if provided) overrides this.
	 */
	switchVariant?: "green" | "blue";

	/**
	 * Optional: override the switch "on" color.
	 * If provided, this overrides `switchVariant`.
	 */
	switchColor?: string;

	/**
	 * Optional style override for the row container.
	 */
	style?: StyleProp<ViewStyle>;

	/**
	 * Optional accessibility label for screen readers.
	 */
	accessibilityLabel?: string;

	/**
	 * Optional accessibility hint for screen readers.
	 */
	accessibilityHint?: string;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const SWITCH_GREEN = "#34C759";
const SWITCH_BLUE = "#0A84FF";

function hexToRgb(hex: string) {
	const cleaned = hex.replace("#", "").trim();
	if (cleaned.length === 3) {
		const r = parseInt(cleaned[0] + cleaned[0], 16);
		const g = parseInt(cleaned[1] + cleaned[1], 16);
		const b = parseInt(cleaned[2] + cleaned[2], 16);
		return { r, g, b };
	}
	if (cleaned.length === 6) {
		const r = parseInt(cleaned.slice(0, 2), 16);
		const g = parseInt(cleaned.slice(2, 4), 16);
		const b = parseInt(cleaned.slice(4, 6), 16);
		return { r, g, b };
	}
	return { r: 0, g: 0, b: 0 };
}

function rgba(hex: string, a: number) {
	const { r, g, b } = hexToRgb(hex);
	return `rgba(${r},${g},${b},${clamp01(a)})`;
}

function BAISwitchRowBase({
	label,
	description,
	value,
	onValueChange,
	disabled = false,
	dense = false,
	switchVariant,
	switchColor,
	style,
	accessibilityLabel,
	accessibilityHint,
}: BAISwitchRowProps) {
	const theme = useTheme();

	const outline = theme.colors.outlineVariant ?? theme.colors.outline;
	const surfaceInteractive = useMemo(
		() => ({
			borderColor: outline,
			backgroundColor: theme.colors.surface,
		}),
		[outline, theme.colors.surface],
	);
	const pressedBg = theme.dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";

	const presetColor = switchVariant === "blue" ? SWITCH_BLUE : SWITCH_GREEN;
	const onColor = switchColor ?? presetColor;

	/**
	 * BRIGHTER SWITCH COLORS (refactor):
	 * - OFF track: more contrast so the control reads clearly, especially on surfaceVariant.
	 * - ON track: higher alpha so the color “pops” (closer to native iOS brightness).
	 * - Thumb: slightly brighter overall; OFF thumb remains visible against brighter OFF track.
	 */
	const offTrackColor = useMemo(() => {
		// Extra contrast in light mode so OFF state is clearly visible on pale surfaces.
		return theme.dark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.38)";
	}, [theme.dark]);

	const onTrackColor = useMemo(() => {
		// Stronger ON contrast in light mode.
		return theme.dark ? rgba(onColor as any, 0.72) : rgba(onColor as any, 0.68);
	}, [onColor, theme.dark]);

	const trackColor = useMemo(
		() => ({
			false: offTrackColor,
			true: onTrackColor,
		}),
		[offTrackColor, onTrackColor],
	);

	const offThumbColor = useMemo(() => {
		// Previously: dark 0.92 / light 0.98 (fine, but OFF felt muted due to track)
		// Keep thumb bright so it reads crisply on the brighter OFF track.
		return theme.dark ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,1)";
	}, [theme.dark]);

	const onThumbColor = useMemo(() => {
		// Keep bright white for ON.
		return "rgba(255,255,255,1)";
	}, []);

	const thumbColor = useMemo(() => (value ? onThumbColor : offThumbColor), [offThumbColor, onThumbColor, value]);
	const iosOffTrackBackgroundColor = useMemo(
		() => (theme.dark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.42)"),
		[theme.dark],
	);
	const switchFrameStyle = useMemo(
		() =>
			theme.dark
				? null
				: {
						backgroundColor: "rgba(0,0,0,0.04)",
						borderColor: "rgba(0,0,0,0.14)",
						borderWidth: StyleSheet.hairlineWidth,
				  },
		[theme.dark],
	);

	const containerStyle = useMemo(
		() => [
			styles.container,
			surfaceInteractive,
			{ paddingVertical: dense ? 10 : 12 },
			disabled && { opacity: 0.55 },
			style,
		],
		[dense, disabled, style, surfaceInteractive],
	);

	const onPress = useCallback(() => {
		if (disabled) return;
		onValueChange(!value);
	}, [disabled, onValueChange, value]);

	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			style={({ pressed }) => [containerStyle, pressed && !disabled && { backgroundColor: pressedBg }]}
			accessibilityRole='switch'
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ checked: value, disabled }}
		>
			<View style={styles.left}>
				<BAIText variant='subtitle'>{label}</BAIText>

				{description ? (
					<BAIText
						variant='caption'
						style={{
							marginTop: 2,
							color: theme.colors.onSurfaceVariant,
						}}
					>
						{description}
					</BAIText>
				) : null}
			</View>

			<View style={styles.right} pointerEvents='none'>
				<View style={[styles.switchWrap, switchFrameStyle]}>
					<Switch
						value={value}
						onValueChange={(next) => {
							if (disabled) return;
							onValueChange(next);
						}}
						disabled={disabled}
						trackColor={trackColor}
						thumbColor={thumbColor}
						ios_backgroundColor={iosOffTrackBackgroundColor}
						// Keep for broad Paper compatibility.
						color={onColor as any}
					/>
				</View>
			</View>
		</Pressable>
	);
}

export const BAISwitchRow = memo(BAISwitchRowBase);

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		paddingHorizontal: 14,
	},
	left: {
		flex: 1,
		paddingRight: 12,
	},
	right: {
		alignItems: "flex-end",
		justifyContent: "center",
	},
	switchWrap: {
		transform: [{ scale: 1.08 }],
		paddingVertical: 2,
		paddingRight: 2,
		paddingLeft: 2,
		borderRadius: 999,
	},
});
