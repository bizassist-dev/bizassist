// BizAssist_mobile path: src/components/system/AddMenuList.tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "react-native-paper";

import { BAIText, type BAITextVariant } from "@/components/ui/BAIText";

export type AddMenuListItem = {
	key: string;
	label: string;
	subtitle: string;
	iconFamily?: "material" | "ion";
	icon?: keyof typeof MaterialCommunityIcons.glyphMap | keyof typeof Ionicons.glyphMap;
	iconSize?: number;
	onPress?: () => void;
	enabled?: boolean;
};

type AddMenuListProps = {
	items: AddMenuListItem[];
	disabled?: boolean;
	titleVariant?: BAITextVariant;
};

export function AddMenuList({ items, disabled, titleVariant = "subtitle" }: AddMenuListProps) {
	const theme = useTheme();

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const rowPressedBg = theme.colors.surfaceVariant ?? theme.colors.surface;
	const listBg = theme.colors.surface;
	const labelColor = theme.colors.onSurface;
	const subtitleColor = theme.colors.onSurfaceVariant;
	const chevronColor = theme.colors.onSurfaceVariant;
	const iconBorderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const iconTint = theme.colors.onSurface;
	const iconBg = theme.colors.background;
	const separatorColor = theme.colors.outlineVariant ?? theme.colors.outline;

	return (
		<View style={[styles.list, { backgroundColor: listBg, borderColor }]}>
			{items.map((item, index) => {
				const isDisabled = disabled || item.enabled === false;
				const isLast = index === items.length - 1;

				return (
					<View key={item.key}>
						<Pressable
							onPress={item.onPress}
							disabled={isDisabled}
							style={({ pressed }) => [
								styles.row,
								pressed && !isDisabled ? { backgroundColor: rowPressedBg } : null,
								isDisabled && styles.disabled,
							]}
						>
							<View style={styles.rowLeft}>
								{item.icon ? (
									<View style={[styles.iconCircle, { borderColor: iconBorderColor, backgroundColor: iconBg }]}>
										{item.iconFamily === "ion" ? (
											<Ionicons
												name={item.icon as keyof typeof Ionicons.glyphMap}
												size={item.iconSize ?? 20}
												color={iconTint}
											/>
										) : (
											<MaterialCommunityIcons
												name={item.icon as keyof typeof MaterialCommunityIcons.glyphMap}
												size={item.iconSize ?? 20}
												color={iconTint}
											/>
										)}
									</View>
								) : null}

								<View style={styles.content}>
									<BAIText variant={titleVariant} style={[styles.label, { color: labelColor }]}>
										{item.label}
									</BAIText>

									<BAIText variant='caption' style={[styles.subtitle, { color: subtitleColor }]}>
										{item.subtitle}
									</BAIText>
								</View>
							</View>

							<MaterialCommunityIcons name='chevron-right' size={24} color={chevronColor} />
						</Pressable>
						{!isLast ? <View style={[styles.separator, { backgroundColor: separatorColor }]} /> : null}
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	list: {
		borderWidth: 1,
		borderRadius: 22,
		overflow: "hidden",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingLeft: 14,
		paddingRight: 10,
		paddingVertical: 12,
		minHeight: 74,
	},
	rowLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		flex: 1,
		paddingRight: 10,
	},
	iconCircle: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
	},
	content: {
		flex: 1,
		gap: 2,
	},
	label: {
		fontWeight: "600",
	},
	subtitle: {
		marginTop: 2,
		lineHeight: 18,
	},
	separator: {
		height: StyleSheet.hairlineWidth,
		marginLeft: 64,
	},
	disabled: {
		opacity: 0.45,
	},
});
