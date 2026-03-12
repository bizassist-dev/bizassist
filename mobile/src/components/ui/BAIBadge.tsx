import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useTheme } from "react-native-paper";

import { BAIText } from "@/components/ui/BAIText";
import { baiSemanticColors } from "@/theme/baiColors";

export type BAIBadgeVariant = "primary" | "danger" | "warning" | "success" | "neutral" | "secondary" | "info";
export type BAIBadgeSize = "xs" | "sm" | "md";

type BAIBadgeProps = {
	children: ReactNode;
	variant?: BAIBadgeVariant;
	size?: BAIBadgeSize;
	style?: StyleProp<ViewStyle>;
	textStyle?: StyleProp<TextStyle>;
};

export function BAIBadge({
	children,
	variant = "neutral",
	size = "md",
	style,
	textStyle,
}: BAIBadgeProps) {
	const theme = useTheme();

	const palette = useMemo(() => {
		switch (variant) {
			case "primary":
				return {
					backgroundColor: theme.colors.primary,
					borderColor: theme.colors.primary,
					textColor: theme.colors.onPrimary,
				};
			case "danger":
				return {
					backgroundColor: theme.colors.error,
					borderColor: theme.colors.error,
					textColor: theme.colors.onError ?? theme.colors.onPrimary,
				};
			case "warning": {
				const warningColor = theme.dark ? baiSemanticColors.warning.dark : baiSemanticColors.warning.main;
				return {
					backgroundColor: warningColor,
					borderColor: warningColor,
					textColor: baiSemanticColors.text.onPrimary,
				};
			}
			case "success": {
				const successColor = theme.dark ? baiSemanticColors.success.dark : baiSemanticColors.success.main;
				return {
					backgroundColor: successColor,
					borderColor: successColor,
					textColor: baiSemanticColors.text.onSuccess,
				};
			}
			case "secondary":
				return {
					backgroundColor: theme.colors.secondary,
					borderColor: theme.colors.secondary,
					textColor: theme.colors.onSecondary,
				};
			case "info": {
				const infoColor = theme.dark ? baiSemanticColors.teal.dark : baiSemanticColors.teal.main;
				return {
					backgroundColor: infoColor,
					borderColor: infoColor,
					textColor: baiSemanticColors.text.onPrimary,
				};
			}
			case "neutral":
			default:
				return {
					backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
					borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
					textColor: theme.colors.onSurfaceVariant ?? theme.colors.onSurface,
				};
		}
	}, [theme, variant]);

	const sizeStyle = size === "xs" ? styles.badgeXs : size === "sm" ? styles.badgeSm : styles.badgeMd;
	const textVariant = "caption";

	return (
		<View style={[styles.badge, sizeStyle, palette, style]}>
			<BAIText variant={textVariant} style={[styles.label, { color: palette.textColor }, textStyle]} numberOfLines={1}>
				{children}
			</BAIText>
		</View>
	);
}

const styles = StyleSheet.create({
	badge: {
		alignSelf: "flex-start",
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	badgeSm: {
		paddingHorizontal: 10,
		paddingVertical: 1,
		minHeight: 22,
	},
	badgeXs: {
		paddingHorizontal: 8,
		paddingVertical: 0,
		minHeight: 18,
	},
	badgeMd: {
		paddingHorizontal: 12,
		paddingVertical: 2,
		minHeight: 24,
	},
	label: {
		fontWeight: "600",
		lineHeight: 14,
		letterSpacing: 0.1,
	},
});