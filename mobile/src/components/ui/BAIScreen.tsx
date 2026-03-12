// BizAssist_mobile
// path: src/components/ui/BAIScreen.tsx

import React from "react";
import { ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "react-native-paper";

import { useResponsiveLayout } from "@/lib/layout/useResponsiveLayout";
import { useAppBackground } from "@/lib/theme/appBackground";

const TAB_BAR_HEIGHT = 68;
const TAB_BAR_GUTTER = 12;

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
		const full = token.length === 3 ? token.split("").map((c) => `${c}${c}`).join("") : token;
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

export type BAIScreenProps = {
	children: React.ReactNode;

	/**
	 * Layout controls
	 */
	tabbed?: boolean;
	padded?: boolean;
	scroll?: boolean;

	/**
	 * Safe area controls
	 */
	safeTop?: boolean;
	safeBottom?: boolean;
	safeAreaGradientTop?: boolean;
	safeAreaGradientBottom?: boolean;

	/**
	 * Width governance
	 *
	 * DEFAULT BEHAVIOR (as of this refactor):
	 * - BAIScreen spans the full available width on BOTH phone and tablet.
	 * - If you want a centered max-width panel on tablet, explicitly set `constrainWidth={true}`.
	 */
	constrainWidth?: boolean;

	/**
	 * Styling
	 */
	style?: StyleProp<ViewStyle>;
	contentContainerStyle?: StyleProp<ViewStyle>;

	/**
	 * ScrollView passthrough
	 * (Use this instead of passing ScrollView props directly to BAIScreen.)
	 */
	scrollProps?: Omit<ScrollViewProps, "contentContainerStyle" | "style" | "children">;
};

export function BAIScreen({
	children,
	tabbed = false,
	padded = true,
	scroll = false,
	safeTop = true,
	safeBottom = true,
	safeAreaGradientTop = false,
	safeAreaGradientBottom = false,

	// Refactor: full-width by default. Opt-in for centered max width.
	constrainWidth = false,

	style,
	contentContainerStyle,
	scrollProps,
}: BAIScreenProps) {
	const insets = useSafeAreaInsets();
	const theme = useTheme();
	const { isTablet, contentMaxWidth, paddingX } = useResponsiveLayout();

	const backgroundColor = useAppBackground();

	// Tab-safe bottom spacing (floating pill tab bar)
	const tabbedBottomInset = TAB_BAR_HEIGHT + Math.max(insets.bottom, TAB_BAR_GUTTER);

	const paddingTop = safeTop ? insets.top : 0;
	const paddingBottom = safeBottom ? (tabbed ? tabbedBottomInset : insets.bottom) : 0;

	const rootStyle: StyleProp<ViewStyle> = [
		styles.root,
		{
			backgroundColor,
			paddingTop,
			paddingBottom,
		},
		style,
	];

	const showTopSafeGradient = safeAreaGradientTop && insets.top > 0;
	const showBottomSafeGradient = safeAreaGradientBottom && insets.bottom > 0;
	const topSafeHeight = insets.top + 20;
	const bottomSafeHeight = tabbed ? insets.bottom + TAB_BAR_HEIGHT + 18 : insets.bottom + 32;

	const topSafeGradientColors = theme.dark
		? (["rgba(0,0,0,0.62)", "rgba(0,0,0,0.24)", "rgba(0,0,0,0)"] as const)
		: (["rgba(255,255,255,0.95)", "rgba(255,255,255,0.58)", "rgba(255,255,255,0)"] as const);
	const bottomDockBlendColor = colorWithAlpha(theme.colors.surface, theme.dark ? 0.8 : 0.9, theme.dark);
	const bottomSafeGradientColors = tabbed
		? ([
				colorWithAlpha(backgroundColor, 0, theme.dark),
				colorWithAlpha(backgroundColor, theme.dark ? 0.22 : 0.16, theme.dark),
				colorWithAlpha(backgroundColor, theme.dark ? 0.46 : 0.3, theme.dark),
				bottomDockBlendColor,
			] as const)
		: theme.dark
			? ([
					colorWithAlpha(backgroundColor, 0, true),
					colorWithAlpha(backgroundColor, 0.78, true),
					colorWithAlpha(backgroundColor, 1, true),
				] as const)
			: (["rgba(255,255,255,0)", "rgba(255,255,255,0.82)", "rgba(255,255,255,1)"] as const);
	const bottomSafeGradientLocations = tabbed ? ([0, 0.32, 0.68, 1] as const) : undefined;

	/**
	 * Base content styling shared by scroll + non-scroll.
	 *
	 * CRITICAL GOVERNANCE:
	 * - Do NOT set `flex: 1` on ScrollView contentContainerStyle.
	 * - `flex: 1` belongs only to the non-scroll container.
	 */
	const baseContentStyle: StyleProp<ViewStyle> = [
		// Always allow full-width layout; only add horizontal padding when requested.
		padded && { paddingHorizontal: paddingX },

		// Tablet max-width governance is now OPT-IN.
		isTablet && constrainWidth && contentMaxWidth
			? { alignSelf: "center", width: "100%", maxWidth: contentMaxWidth }
			: null,

		contentContainerStyle,
	];

	if (scroll) {
		return (
			<View style={rootStyle}>
				<ScrollView
					style={styles.flex}
					contentInsetAdjustmentBehavior='never'
					automaticallyAdjustContentInsets={false}
					keyboardShouldPersistTaps='handled'
					keyboardDismissMode='on-drag'
					contentContainerStyle={[styles.scrollContent, baseContentStyle]}
					{...scrollProps}
				>
					{children}
				</ScrollView>
				{showTopSafeGradient ? (
					<LinearGradient
						pointerEvents='none'
						colors={topSafeGradientColors}
						style={[styles.safeGradientOverlay, styles.safeGradientTop, { height: topSafeHeight }]}
					/>
				) : null}
				{showBottomSafeGradient ? (
					<LinearGradient
						pointerEvents='none'
						colors={bottomSafeGradientColors}
						locations={bottomSafeGradientLocations}
						style={[styles.safeGradientOverlay, styles.safeGradientBottom, { height: bottomSafeHeight }]}
					/>
				) : null}
			</View>
		);
	}

	return (
		<View style={rootStyle}>
			<View style={[styles.nonScrollContent, baseContentStyle]}>{children}</View>
			{showTopSafeGradient ? (
				<LinearGradient
					pointerEvents='none'
					colors={topSafeGradientColors}
					style={[styles.safeGradientOverlay, styles.safeGradientTop, { height: topSafeHeight }]}
				/>
			) : null}
			{showBottomSafeGradient ? (
				<LinearGradient
					pointerEvents='none'
					colors={bottomSafeGradientColors}
					locations={bottomSafeGradientLocations}
					style={[styles.safeGradientOverlay, styles.safeGradientBottom, { height: bottomSafeHeight }]}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, position: "relative" },
	flex: { flex: 1 },

	// ScrollView content container: grow, don’t “fix” height.
	scrollContent: { flexGrow: 1 },

	// Non-scroll content container: fill.
	nonScrollContent: { flex: 1 },

	safeGradientOverlay: {
		position: "absolute",
		left: 0,
		right: 0,
		zIndex: 1,
	},
	safeGradientTop: {
		top: 0,
	},
	safeGradientBottom: {
		bottom: 0,
	},
});
