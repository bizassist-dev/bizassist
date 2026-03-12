import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppBackground } from "@/lib/theme/appBackground";

const DEFAULT_EXTRA_HEIGHT = 24;
const TABBED_EXTRA_HEIGHT = 32;

function clampAlpha(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.max(0, Math.min(1, value));
}

function colorWithAlpha(color: string, alpha: number, fallbackDark: boolean): string {
	const a = clampAlpha(alpha);
	const raw = String(color ?? "").trim();
	if (!raw) return fallbackDark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;

	const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (hex) {
		const token = hex[1];
		const full =
			token.length === 3
				? token
						.split("")
						.map((c) => `${c}${c}`)
						.join("")
				: token;
		const r = parseInt(full.slice(0, 2), 16);
		const g = parseInt(full.slice(2, 4), 16);
		const b = parseInt(full.slice(4, 6), 16);
		return `rgba(${r},${g},${b},${a})`;
	}

	const rgb = raw.match(/^rgba?\(([^)]+)\)$/i);
	if (rgb) {
		const parts = rgb[1]
			.split(",")
			.map((part) => part.trim())
			.slice(0, 3)
			.map((part) => Number(part));
		if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
			const [r, g, b] = parts;
			return `rgba(${r},${g},${b},${a})`;
		}
	}

	return fallbackDark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
}

export type BAIBottomSafeAreaScrimProps = {
	tabbed?: boolean;
	extraHeight?: number;
	style?: StyleProp<ViewStyle>;
};

export function BAIBottomSafeAreaScrim({
	tabbed = false,
	extraHeight,
	style,
}: BAIBottomSafeAreaScrimProps) {
	const { bottom } = useSafeAreaInsets();
	const theme = useTheme();
	const backgroundColor = useAppBackground();

	const resolvedExtraHeight = extraHeight ?? (tabbed ? TABBED_EXTRA_HEIGHT : DEFAULT_EXTRA_HEIGHT);
	const colors = theme.dark
		? ([
				colorWithAlpha(backgroundColor, 0, true),
				colorWithAlpha(backgroundColor, 0.66, true),
				colorWithAlpha(backgroundColor, 0.96, true),
			] as const)
		: ([
				colorWithAlpha(backgroundColor, 0, false),
				colorWithAlpha(backgroundColor, 0.6, false),
				colorWithAlpha(backgroundColor, 0.9, false),
			] as const);
	const height = bottom + resolvedExtraHeight;
	if (bottom <= 0 || !Number.isFinite(height) || height <= 0) {
		return null;
	}

	return (
		<LinearGradient
			pointerEvents='none'
			colors={colors}
			style={[styles.scrim, { height }, style]}
		/>
	);
}

const styles = StyleSheet.create({
	scrim: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 20,
	},
});
