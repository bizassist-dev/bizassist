// BizAssist_mobile
// path: src/components/ui/BAICard.tsx

import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";

import { BAISurface } from "@/components/ui/BAISurface";

export type BAICardProps = {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;

	/**
	 * If you need to remove default padding and fully control inner layout.
	 * Default keeps a sensible content padding for consistent screens.
	 */
	padded?: boolean;

	/**
	 * Default true to keep card borders consistently visible (UI governance).
	 */
	bordered?: boolean;
};

export function BAICard({ children, style, padded = true, bordered = true }: BAICardProps) {
	const theme = useTheme();

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const borderWidth = StyleSheet.hairlineWidth;

	return (
		<BAISurface
			padded={false}
			bordered={bordered}
			style={[
				styles.container,
				bordered && { borderColor, borderWidth },
				{ backgroundColor: theme.colors.surface },
				style,
			]}
		>
			{/* Inner clipper so we can keep shadows from BAISurface while still clipping rounded corners */}
			<View style={[styles.clipper, padded && styles.padded]}>{children}</View>
		</BAISurface>
	);
}

const styles = StyleSheet.create({
	container: {
		borderRadius: 22,
		marginBottom: 12,
	},
	clipper: {
		borderRadius: 22,
		overflow: "hidden",
	},
	padded: {
		paddingVertical: 14,
		paddingHorizontal: 14,
	},
});
