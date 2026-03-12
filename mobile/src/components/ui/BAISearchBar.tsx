// BizAssist_mobile
// path: src/components/ui/BAISearchBar.tsx

import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { FIELD_LIMITS } from "@/shared/fieldLimits";

type Props = {
	value: string;
	onChangeText: (v: string) => void;

	placeholder?: string;
	disabled?: boolean;

	// UX options
	autoFocus?: boolean;
	returnKeyType?: "search" | "done" | "go" | "next";
	onSubmit?: () => void;

	// Clear button
	showClear?: boolean;
	onClear?: () => void;

	// Caps / governance
	maxLength?: number;

	// Styling hooks (keep minimal)
	style?: StyleProp<ViewStyle>;
	inputStyle?: StyleProp<TextStyle>;
	height?: number;

	// A11y / testing
	testID?: string;
	accessibilityLabel?: string;
};

function capText(raw: string, maxLen: number) {
	if (maxLen <= 0) return "";
	return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
}

export function BAISearchBar({
	value,
	onChangeText,
	placeholder = "Search",
	disabled,
	autoFocus,
	returnKeyType = "search",
	onSubmit,
	showClear = true,
	onClear,
	maxLength,
	style,
	inputStyle,
	height = 56,
	testID,
	accessibilityLabel = "Search",
}: Props) {
	const theme = useTheme();

	const isDisabled = !!disabled;

	const bg = theme.colors.surface;
	const border = theme.colors.outline;
	const textColor = theme.colors.onSurface;
	const placeholderColor = theme.colors.onSurfaceVariant ?? theme.colors.onSurfaceDisabled ?? theme.colors.outline;

	const iconColor = theme.colors.onSurfaceDisabled ?? theme.colors.outline;
	const canClear = !isDisabled && showClear && value.trim().length > 0;

	const cap = Math.max(0, Math.min(maxLength ?? FIELD_LIMITS.search, FIELD_LIMITS.search));

	const handleChangeText = useCallback(
		(v: string) => {
			onChangeText(capText(v, cap));
		},
		[cap, onChangeText],
	);

	const handleClear = useCallback(() => {
		if (!canClear) return;
		if (onClear) onClear();
		else onChangeText("");
	}, [canClear, onClear, onChangeText]);

	const containerStyle = useMemo(
		() => [
			styles.container,
			{
				height,
				borderRadius: height / 2,
				backgroundColor: bg,
				borderColor: border,
			},
			style,
		],
		[bg, border, height, style],
	);

	return (
		<View style={containerStyle} testID={testID} accessibilityLabel={accessibilityLabel}>
			<View style={[styles.iconLeft, { width: height, height, borderRadius: height / 2 }]}>
				<MaterialCommunityIcons name='magnify' size={22} color={iconColor} />
			</View>

			<TextInput
				style={[
					styles.input,
					{
						height,
						color: textColor,
						paddingLeft: height - 6, // leaves room for left icon
						paddingRight: canClear ? height - 4 : 18,
					},
					inputStyle,
				]}
				value={value}
				onChangeText={handleChangeText}
				placeholder={placeholder}
				placeholderTextColor={placeholderColor}
				editable={!isDisabled}
				autoCapitalize='none'
				autoCorrect={false}
				autoFocus={autoFocus}
				returnKeyType={returnKeyType}
				enablesReturnKeyAutomatically
				blurOnSubmit
				onSubmitEditing={typeof onSubmit === "function" ? onSubmit : undefined}
				maxLength={cap}
				// Prevent selection menu / weirdness in some enterprise flows; safe default.
				contextMenuHidden={false}
			/>

			{showClear ? (
				<Pressable
					disabled={!canClear}
					onPress={handleClear}
					style={[styles.iconRight, { width: height, height, borderRadius: height / 2 }]}
					hitSlop={10}
					accessibilityRole='button'
					accessibilityLabel='Clear search'
				>
					<MaterialCommunityIcons
						name={canClear ? "close-circle" : "close-circle-outline"}
						size={28}
						color={canClear ? theme.colors.onSurface : iconColor}
					/>
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "relative",
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		overflow: "hidden",

		shadowColor: "#000",
		shadowOpacity: 0.04,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 2 },
		elevation: 1,
	},
	iconLeft: {
		position: "absolute",
		left: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	iconRight: {
		position: "absolute",
		right: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	input: {
		flex: 1,
		fontSize: 16,
		paddingVertical: 0,
	},
});
