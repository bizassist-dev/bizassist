import React from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useTheme } from "react-native-paper";
import { BAIText } from "@/components/ui/BAIText";
import { baiColors } from "@/theme/baiColors";

export function BAIHeaderActionButton({
	label,
	disabled = false,
	variant = "text",
	icon,
	style,
	labelStyle,
}: {
	label?: string;
	disabled?: boolean;
	variant?: "text" | "solid-primary" | "icon-primary";
	icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
	style?: StyleProp<ViewStyle>;
	labelStyle?: StyleProp<TextStyle>;
}) {
	const theme = useTheme();
	const resolvedLabel = label ?? "";
	const primaryActionColor = baiColors.blue[500];

	if (variant === "icon-primary") {
		return (
			<View
				style={[
					styles.iconWrap,
					{
						backgroundColor: disabled ? theme.colors.surfaceDisabled : primaryActionColor,
					},
					style,
				]}
			>
				<MaterialCommunityIcons
					name={icon ?? "plus"}
					size={26}
					color={disabled ? theme.colors.onSurfaceDisabled : theme.colors.onPrimary}
				/>
			</View>
		);
	}

	if (variant === "solid-primary") {
		return (
			<View
				style={[
					styles.solidWrap,
					{
						backgroundColor: disabled ? theme.colors.surfaceDisabled : primaryActionColor,
					},
					style,
				]}
			>
				<BAIText
					variant='subtitle'
					style={[
						styles.label,
						{ color: disabled ? theme.colors.onSurfaceDisabled : theme.colors.onPrimary },
						labelStyle,
					]}
				>
					{resolvedLabel}
				</BAIText>
			</View>
		);
	}

	return (
		<BAIText
			variant='subtitle'
			style={[styles.label, { color: disabled ? theme.colors.onSurfaceDisabled : primaryActionColor }, labelStyle]}
		>
			{resolvedLabel}
		</BAIText>
	);
}

const styles = StyleSheet.create({
	label: {
		fontWeight: "500",
	},
	solidWrap: {
		minWidth: 96,
		minHeight: 50,
		paddingHorizontal: 18,
		borderRadius: 25,
		alignItems: "center",
		justifyContent: "center",
	},
	iconWrap: {
		width: 50,
		height: 50,
		borderRadius: 25,
		alignItems: "center",
		justifyContent: "center",
	},
});
