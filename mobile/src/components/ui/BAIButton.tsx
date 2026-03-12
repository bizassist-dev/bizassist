// BizAssist_mobile path: src/components/ui/BAIButton.tsx

import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { Button, useTheme } from "react-native-paper";

import {
	BAIButtonIntent,
	BAIButtonVariant,
	baiButtonPrimaryDisabledSolid,
	baiButtonPrimaryPressedSolid,
	baiButtonThemeByMode,
} from "@/theme/baiColors";
import { getAccessibleTextColor } from "@/theme/contrast";
import {
	CTA_WIDTH_PRESET,
	isFullWidthPreset,
	type BAIButtonShape,
	type BAIButtonWidthPreset,
	resolveButtonShape,
	resolveButtonWidthPreset,
	resolveButtonWidthStyle,
} from "@/lib/ui/buttonGovernance";

type BAIButtonSize = "sm" | "md" | "lg";

const HEIGHT_BY_SIZE: Record<BAIButtonSize, number> = { sm: 40, md: 50, lg: 56 };
const H_PADDING_BY_SIZE: Record<BAIButtonSize, number> = { sm: 14, md: 18, lg: 20 };
const FONT_BY_SIZE: Record<BAIButtonSize, number> = { sm: 14, md: 16, lg: 17 };
const ICON_BY_SIZE: Record<BAIButtonSize, number> = { sm: 18, md: 20, lg: 22 };

const DEFAULT_RADIUS = 16;

const DISABLED_PREFERRED_DARK_TEXT = "#374151";
const NEUTRAL_OUTLINE_PREFERRED_DARK_TEXT = "#111827";

type PaperButtonMode = React.ComponentProps<typeof Button>["mode"];

const MODE_BY_VARIANT: Record<BAIButtonVariant, PaperButtonMode> = {
	solid: "contained",
	soft: "contained-tonal",
	subtle: "contained-tonal",
	outline: "outlined",
	ghost: "text",
	inverse: "contained",
};

type Props = Omit<React.ComponentProps<typeof Button>, "children" | "icon"> & {
	children?: React.ReactNode;
	intent?: BAIButtonIntent | null;
	variant?: BAIButtonVariant | null;

	size?: BAIButtonSize;

	/**
	 * Shape governance:
	 * - default: rounded corner system
	 * - pill: explicit opt-in for compact buttons only
	 * - compact/non-full-width buttons infer pill when shape is omitted
	 */
	shape?: BAIButtonShape;

	/**
	 * Width governance:
	 * - cta: standardized CTA width (matches retry/empty)
	 * - full: full-width button
	 * - standard: compact/non-full-width button
	 */
	widthPreset?: BAIButtonWidthPreset | null;

	/**
	 * Alias for widthPreset (kept for ergonomics).
	 */
	width?: BAIButtonWidthPreset | null;

	/**
	 * Legacy/compatibility flags (map to full-width).
	 */
	fullWidth?: boolean;
	block?: boolean;
	stretch?: boolean;

	borderRadius?: number;
	iconLeft?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
	style?: StyleProp<ViewStyle>;
};

function resolveIntent(intent?: BAIButtonIntent | null): BAIButtonIntent {
	if (!intent) return "primary";
	return intent in baiButtonThemeByMode.light ? (intent as BAIButtonIntent) : "primary";
}

function resolveVariant(intent: BAIButtonIntent, variant?: BAIButtonVariant | null): BAIButtonVariant {
	if (!variant) return "solid";
	if ((variant as string) === "lightNeutral") return "subtle";
	return variant in baiButtonThemeByMode.light[intent] ? (variant as BAIButtonVariant) : "solid";
}

function nodeText(node: React.ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (!node) return "";
	if (Array.isArray(node)) return node.map((child) => nodeText(child)).join("");
	if (React.isValidElement(node)) return nodeText((node.props as any)?.children);
	return "";
}

export function BAIButton({
	intent = "primary",
	variant = "solid",
	size = "md",
	shape,
	widthPreset,
	width,
	fullWidth = false,
	block = false,
	stretch = false,

	disabled = false,
	loading = false,

	borderRadius = DEFAULT_RADIUS,
	iconLeft,
	style,
	contentStyle,
	labelStyle,
	children,
	...rest
}: Props) {
	const theme = useTheme();
	const modeKey: "light" | "dark" = theme.dark ? "dark" : "light";

	const safeIntent = resolveIntent(intent);
	const safeVariant = resolveVariant(safeIntent, variant);

	const resolvedWidthPreset = resolveButtonWidthPreset({
		widthPreset,
		width,
		fullWidth,
		block,
		stretch,
	});

	const flattenedStyle = React.useMemo(() => StyleSheet.flatten(style) as ViewStyle | undefined, [style]);

	const isFullWidthButton =
		isFullWidthPreset(resolvedWidthPreset ?? CTA_WIDTH_PRESET) ||
		flattenedStyle?.alignSelf === "stretch" ||
		flattenedStyle?.width === "100%";

	const normalizedLabel = nodeText(children).trim().toLowerCase();
	const isCancelButton = normalizedLabel === "cancel";
	const inferredShape: BAIButtonShape | undefined =
		shape ?? (isCancelButton ? "pill" : !isFullWidthButton ? "pill" : undefined);

	const resolvedShape = resolveButtonShape({
		shape: inferredShape,
		isFullWidth: isFullWidthButton,
	});

	const widthStyle = resolveButtonWidthStyle(resolvedWidthPreset ?? CTA_WIDTH_PRESET);

	const cfg = baiButtonThemeByMode[modeKey][safeIntent][safeVariant];

	const isInteractionDisabled = disabled || loading;
	const isVisuallyDisabled = disabled;

	const mode: PaperButtonMode = MODE_BY_VARIANT[safeVariant] ?? "contained";

	const [isPressed, setIsPressed] = React.useState(false);

	const handlePressIn = (e: any) => {
		if (!disabled && !loading) setIsPressed(true);
		rest.onPressIn?.(e);
	};

	const handlePressOut = (e: any) => {
		setIsPressed(false);
		rest.onPressOut?.(e);
	};

	const paperDisabledBg = (theme.colors as any)?.surfaceDisabled ?? theme.colors.surfaceVariant ?? theme.colors.surface;

	const paperDisabledBorder =
		(theme.colors as any)?.outlineVariant ??
		theme.colors.outline ??
		theme.colors.onSurfaceVariant ??
		theme.colors.onSurface;

	const isPrimarySolid = safeIntent === "primary" && safeVariant === "solid";
	const primaryDisabledCfg = baiButtonPrimaryDisabledSolid[modeKey];
	const primaryPressedCfg = baiButtonPrimaryPressedSolid[modeKey];

	const shouldUsePressed = isPrimarySolid && isPressed && !disabled && !loading;

	const backgroundColor = isVisuallyDisabled
		? isPrimarySolid
			? primaryDisabledCfg.background
			: safeVariant === "outline"
				? paperDisabledBg
				: safeVariant === "ghost"
					? "transparent"
					: paperDisabledBg
		: shouldUsePressed
			? primaryPressedCfg.background
			: cfg.background;

	/**
	 * Critical: always reserve border space so "outlined + disabled" never increases height.
	 */
	const borderWidth = 1;

	const borderColor = isVisuallyDisabled
		? isPrimarySolid
			? primaryDisabledCfg.border
			: paperDisabledBorder
		: shouldUsePressed
			? primaryPressedCfg.border
			: safeVariant === "outline"
				? cfg.border
				: "transparent";

	const height = HEIGHT_BY_SIZE[size];
	const paddingHorizontal = H_PADDING_BY_SIZE[size];
	const fontSize = FONT_BY_SIZE[size];
	const iconSize = ICON_BY_SIZE[size];
	const lineHeight = Math.round(fontSize * 1.25);

	const computedBorderRadius = resolvedShape === "pill" ? Math.ceil(height / 2) : borderRadius;

	const effectiveBgForText =
		backgroundColor === "transparent" ? (theme.colors.surface ?? paperDisabledBg) : backgroundColor;

	const isNeutralOutlineEnabled = !isVisuallyDisabled && safeIntent === "neutral" && safeVariant === "outline";

	const resolvedTextColor = isPrimarySolid
		? "#FFFFFF"
		: isVisuallyDisabled
			? getAccessibleTextColor(effectiveBgForText, DISABLED_PREFERRED_DARK_TEXT, 4.5)
			: isNeutralOutlineEnabled
				? getAccessibleTextColor(effectiveBgForText, NEUTRAL_OUTLINE_PREFERRED_DARK_TEXT, 4.5)
				: backgroundColor === "transparent"
					? cfg.text
					: getAccessibleTextColor(backgroundColor, cfg.text, 4.5);

	const hasIcon = Boolean(iconLeft);

	/**
	 * Deterministic inner sizing:
	 * - lock inner height
	 * - remove vertical padding variance (Paper changes this by state/mode)
	 */
	const baseContentStyle: ViewStyle = {
		height,
		minHeight: height,
		paddingHorizontal,
		paddingVertical: 0,
		justifyContent: "center",
		alignItems: "center",
		flexDirection: "row",
		gap: hasIcon ? 8 : 0,
	};

	const baseLabelStyle: any = {
		textTransform: "none",
		fontWeight: "500",
		fontSize,
		lineHeight,
		letterSpacing: 0.2,
		includeFontPadding: false,
		textAlign: "center",
		textAlignVertical: "center",
	};

	return (
		<Button
			{...rest}
			onPressIn={handlePressIn}
			onPressOut={handlePressOut}
			disabled={isInteractionDisabled}
			loading={loading}
			mode={mode}
			compact
			buttonColor={backgroundColor}
			textColor={resolvedTextColor}
			icon={
				iconLeft
					? () => <MaterialCommunityIcons name={iconLeft} size={iconSize} color={resolvedTextColor} />
					: undefined
			}
			style={[
				{
					// Wrapper fixed size (not just content)
					height,
					minHeight: height,

					borderRadius: computedBorderRadius,
					borderWidth,
					borderColor,
					elevation: 0,
				},
				widthStyle,
				style,
			]}
			contentStyle={[baseContentStyle, contentStyle]}
			labelStyle={[baseLabelStyle, labelStyle]}
		>
			{children}
		</Button>
	);
}
