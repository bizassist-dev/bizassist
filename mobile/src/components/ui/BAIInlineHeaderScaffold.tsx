import React, { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "react-native-paper";

import { BAIHeader } from "@/components/ui/BAIHeader";

type BAIInlineHeaderScaffoldProps = {
	title: string;
	variant: "back" | "exit";
	onLeftPress?: () => void;
	disabled?: boolean;
	showAvatarPlaceholder?: boolean;
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
};

export function BAIInlineHeaderScaffold({
	title,
	variant,
	onLeftPress,
	disabled = false,
	showAvatarPlaceholder = false,
	children,
	style,
}: BAIInlineHeaderScaffoldProps) {
	const theme = useTheme();

	return (
		<View style={[styles.root, { backgroundColor: theme.colors.background }, style]}>
			<Stack.Screen options={{ headerShown: false }} />
			<BAIHeader
				title={title}
				variant={variant}
				onLeftPress={onLeftPress}
				disabled={disabled}
				showAvatarPlaceholder={showAvatarPlaceholder}
			/>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
});
