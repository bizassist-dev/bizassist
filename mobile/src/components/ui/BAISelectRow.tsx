// BizAssist_mobile path: src/components/ui/BAISelectRow.tsx
import { useCallback } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "react-native-paper";

import { BAIText } from "@/components/ui/BAIText";
import { BAIButton } from "./BAIButton";

type Props = {
	label: string;
	value: string;
	buttonLabel?: string;
	onPress: () => void;
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
};

export function BAISelectRow({ label, value, buttonLabel = "Select", onPress, disabled = false, style }: Props) {
	const theme = useTheme();

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const surface = theme.colors.surface;

	const textPrimary = theme.colors.onSurface;
	const textMuted = theme.colors.onSurfaceVariant ?? theme.colors.onSurface;
	const ctaText = theme.colors.onPrimary;

	const handlePress = useCallback(() => {
		if (disabled) return;
		onPress();
	}, [disabled, onPress]);

	return (
		<View style={[styles.container, { borderColor, backgroundColor: surface }, style, disabled && { opacity: 0.9 }]}>
			<View style={styles.left}>
				<BAIText variant='caption' style={{ color: textMuted }}>
					{label}
				</BAIText>
				<BAIText variant='body' numberOfLines={1} style={{ color: textPrimary, fontSize: 16 }}>
					{value}
				</BAIText>
			</View>

			<BAIButton
				variant='solid'
				intent='primary'
				onPress={handlePress}
				disabled={disabled}
				hitSlop={10}
				widthPreset='standard'
				shape='pill'
			>
				<BAIText variant='body' style={[styles.ctaText, { color: ctaText }]}>
					{buttonLabel}
				</BAIText>
			</BAIButton>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		paddingVertical: 12,
		paddingLeft: 14,
		paddingRight: 10,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},

	left: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},

	cta: {
		borderRadius: 14,
		paddingHorizontal: 18,
		paddingVertical: 10,
		alignItems: "center",
		justifyContent: "center",
		minWidth: 104,
	},

	ctaText: {
		fontWeight: "700",
	},
});
