// BizAssist_mobile
// path: app/(app)/(tabs)/pos/_layout.tsx
//
// POS stack
// Governance:
// - Keep header hidden by default to avoid layout changes.
// - Process screens (e.g., cart quantity editor) opt-in to header via <Stack.Screen ... />.

import React, { useMemo } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "react-native-paper";

export default function PosLayout() {
	const theme = useTheme();

	const headerStyle = useMemo(
		() => ({
			backgroundColor: theme.colors.background,
			...(Platform.OS === "android" ? { elevation: 0, borderBottomWidth: 0 } : {}),
		}),
		[theme.colors.background],
	);

	const headerTintColor = useMemo(() => theme.colors.onBackground, [theme.colors.onBackground]);
	const headerTitleStyle = useMemo(
		() => ({
			color: theme.colors.onBackground,
			fontSize: 18,
			fontWeight: "600" as const,
		}),
		[theme.colors.onBackground],
	);

	const headerBackTitleStyle = useMemo(
		() => ({
			fontSize: 14,
			fontWeight: "500" as const,
			color: theme.colors.onSurfaceVariant ?? theme.colors.onBackground,
		}),
		[theme.colors.onSurfaceVariant, theme.colors.onBackground],
	);

	return (
		<Stack
			screenOptions={{
				headerShown: false,
				headerTitleAlign: "center",
				headerBackTitle: "",
				headerStyle,
				headerTintColor,
				headerTitleStyle,
				headerBackTitleStyle,
				headerShadowVisible: false,
				animation: "default",
			}}
		>
			<Stack.Screen name='index' />
			<Stack.Screen name='pos.phone' />
			<Stack.Screen name='pos.tablet' />
			<Stack.Screen name='scan' />
			<Stack.Screen name='discounts/select' />
			<Stack.Screen name='discounts/enter-value' />
			<Stack.Screen name='cart/edit-quantity' />
		</Stack>
	);
}
