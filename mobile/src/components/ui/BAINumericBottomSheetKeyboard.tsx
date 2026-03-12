import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Pressable, StyleSheet, View } from "react-native";
import { Portal, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { baiColors } from "@/theme/baiColors";

export const NUMERIC_BOTTOM_SHEET_KEYS = [
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"00",
	"0",
	"backspace",
] as const;

export type BAINumericBottomSheetKey = (typeof NUMERIC_BOTTOM_SHEET_KEYS)[number];

const DEFAULT_ROWS: readonly (readonly BAINumericBottomSheetKey[])[] = [
	["1", "2", "3"],
	["4", "5", "6"],
	["7", "8", "9"],
	["00", "0", "backspace"],
];
const MAX_CONTENT_BOTTOM_PADDING = 40;

type BAINumericBottomSheetKeyboardProps = {
	visible: boolean;
	onDismiss: () => void;
	onKeyPress: (key: BAINumericBottomSheetKey) => void;
	sheetKey?: string;
	bottomPadding?: number;
	keyBackgroundColor?: string;
};

export function BAINumericBottomSheetKeyboard({
	visible,
	onDismiss,
	onKeyPress,
	sheetKey,
	bottomPadding = 24,
	keyBackgroundColor,
}: BAINumericBottomSheetKeyboardProps) {
	const theme = useTheme();
	const confirmButtonColor = baiColors.blue[500];
	const translateY = useRef(new Animated.Value(320)).current;
	const closeTokenRef = useRef(0);
	const systemKeyboardDismissedRef = useRef(false);
	const [mounted, setMounted] = useState(visible);

	useEffect(() => {
		if (visible) {
			closeTokenRef.current += 1;
			setMounted(true);
			translateY.stopAnimation();
			translateY.setValue(320);
			Animated.timing(translateY, {
				toValue: 0,
				duration: 220,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}).start();
			return;
		}

		if (!mounted) return;

		const closeToken = closeTokenRef.current + 1;
		closeTokenRef.current = closeToken;
		translateY.stopAnimation();
		Animated.timing(translateY, {
			toValue: 320,
			duration: 200,
			easing: Easing.in(Easing.cubic),
			useNativeDriver: true,
		}).start(({ finished }) => {
			if (!finished) return;
			if (closeTokenRef.current !== closeToken) return;
			setMounted(false);
		});
	}, [mounted, translateY, visible]);

	useEffect(() => {
		systemKeyboardDismissedRef.current = false;
	}, [visible]);

	useEffect(() => {
		if (!visible) return;

		const handleSystemKeyboardShow = () => {
			if (systemKeyboardDismissedRef.current) return;
			systemKeyboardDismissedRef.current = true;
			onDismiss();
		};

		const keyboardWillShowSub = Keyboard.addListener("keyboardWillShow", handleSystemKeyboardShow);
		const keyboardDidShowSub = Keyboard.addListener("keyboardDidShow", handleSystemKeyboardShow);

		return () => {
			keyboardWillShowSub.remove();
			keyboardDidShowSub.remove();
		};
	}, [onDismiss, visible]);

	const resolvedKeyBackground = useMemo(
		() => keyBackgroundColor ?? theme.colors.surfaceVariant ?? theme.colors.surface,
		[keyBackgroundColor, theme.colors.surface, theme.colors.surfaceVariant],
	);
	const resolvedContentBottomPadding = useMemo(
		() => Math.min(MAX_CONTENT_BOTTOM_PADDING, Math.max(0, bottomPadding)),
		[bottomPadding],
	);
	const highlightedKeyBackground = useMemo(
		() => (theme.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)"),
		[theme.dark],
	);
	const highlightedKeyBorder = useMemo(
		() => (theme.dark ? "rgba(255,255,255,0.26)" : "rgba(0,0,0,0.16)"),
		[theme.dark],
	);
	const highlightedKeyTextColor = useMemo(
		() => (theme.dark ? "rgba(255,255,255,0.96)" : "rgba(0,0,0,0.86)"),
		[theme.dark],
	);

	if (!mounted) return null;

	return (
		<Portal>
			<View pointerEvents='box-none' style={styles.overlay}>
				<Animated.View
					style={{
						transform: [{ translateY }],
						marginBottom: 0,
					}}
				>
					<BAISurface
						key={sheetKey}
						padded={false}
						bordered
						style={[
							styles.sheet,
							{
								backgroundColor: theme.colors.surface,
								borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
								paddingBottom: resolvedContentBottomPadding,
							},
						]}
					>
						<Pressable onPress={onDismiss} style={({ pressed }) => [styles.dismissTap, pressed ? styles.pressed : null]}>
							<View
								style={[
									styles.dismissHandle,
									{ backgroundColor: theme.colors.outlineVariant ?? theme.colors.outline },
								]}
							/>
						</Pressable>

						<View style={styles.grid}>
							{DEFAULT_ROWS.map((row, rowIndex) => (
								<View key={`row-${rowIndex}`} style={styles.row}>
									{row.map((key) => {
										const isBackspace = key === "backspace";
										const isHighlighted = key === "00" || isBackspace;
										return (
											<Pressable
												key={key}
												onPress={() => onKeyPress(key)}
												style={({ pressed }) => [
													styles.key,
													{
														borderColor: isHighlighted
															? highlightedKeyBorder
															: theme.colors.outlineVariant ?? theme.colors.outline,
														backgroundColor: isHighlighted ? highlightedKeyBackground : resolvedKeyBackground,
													},
													pressed ? styles.pressed : null,
												]}
											>
												{isBackspace ? (
													<MaterialCommunityIcons
														name='backspace-outline'
														size={26}
														color={isHighlighted ? highlightedKeyTextColor : theme.colors.onSurface}
													/>
												) : (
													<BAIText
														variant='title'
														style={[styles.keyText, isHighlighted ? { color: highlightedKeyTextColor } : null]}
													>
														{key}
													</BAIText>
												)}
											</Pressable>
										);
									})}
								</View>
							))}
						</View>

						<Pressable
							onPress={onDismiss}
							style={({ pressed }) => [
								styles.doneButton,
								{ backgroundColor: confirmButtonColor },
								pressed ? styles.pressed : null,
							]}
						>
							<MaterialCommunityIcons name='check-bold' size={30} color={theme.colors.onPrimary} />
						</Pressable>
					</BAISurface>
				</Animated.View>
			</View>
		</Portal>
	);
}

const styles = StyleSheet.create({
	overlay: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "flex-end",
	},
	sheet: {
		width: "100%",
		marginBottom: 0,
		paddingHorizontal: 10,
		paddingTop: 12,
		borderRadius: 0,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderBottomLeftRadius: 0,
		borderBottomRightRadius: 0,
		gap: 8,
	},
	dismissTap: {
		alignItems: "center",
		justifyContent: "center",
		paddingTop: 2,
		paddingBottom: 4,
	},
	dismissHandle: {
		width: 46,
		height: 5,
		borderRadius: 999,
	},
	grid: {
		gap: 6,
	},
	row: {
		flexDirection: "row",
		gap: 6,
	},
	key: {
		flex: 1,
		height: 56,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	keyText: {
		fontWeight: "700",
	},
	doneButton: {
		height: 50,
		borderRadius: 12,
		marginTop: 10,
		marginBottom: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: {
		opacity: 0.86,
	},
});
