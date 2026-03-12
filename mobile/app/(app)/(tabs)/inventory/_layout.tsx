// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/_layout.tsx

import React, { useMemo } from "react";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import { useTheme } from "react-native-paper";

export default function InventoryStackLayout() {
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

	// Smaller + muted back button title
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
				headerShown: true,
				headerTitleAlign: "center",
				contentStyle: { backgroundColor: theme.colors.background },

				// Default: hide back title everywhere
				headerBackTitle: "",

				headerStyle,
				headerTintColor,
				headerTitleStyle,
				headerBackTitleStyle,
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name='index' options={{ headerShown: false }} />
			<Stack.Screen name='scan' options={{ title: "Scan" }} />

			{/* Add Item */}
			<Stack.Screen
				name='add-item'
				options={{
					title: "Add Items",
					headerBackTitle: "Inventory",
				}}
			/>

			<Stack.Screen name='products/create' options={{ title: "Add Items" }} />
			<Stack.Screen name='products/manage-stock' options={{ headerShown: false }} />
			<Stack.Screen name='products/stock-received' options={{ headerShown: false }} />
			<Stack.Screen name='categories/category.ledger' options={{ headerShown: false }} />
			<Stack.Screen name='categories/create' options={{ title: "Create Category" }} />
			<Stack.Screen name='categories/[id]/index' options={{ headerShown: false }} />
			<Stack.Screen name='categories/[id]/items/[itemId]/index' options={{ headerShown: false }} />
			<Stack.Screen name='categories/[id]/edit' options={{ title: "Edit Category" }} />
			<Stack.Screen name='categories/[id]/archive' options={{ title: "Archive Category" }} />
			<Stack.Screen name='categories/[id]/restore' options={{ title: "Restore Category" }} />
			<Stack.Screen name='categories/picker' options={{ title: "Select Categories" }} />
			<Stack.Screen name='discounts/discount.ledger' options={{ headerShown: false }} />
			<Stack.Screen name='discounts/create' options={{ headerShown: false }} />
			<Stack.Screen name='discounts/[id]/index' options={{ headerShown: false }} />
			<Stack.Screen name='discounts/[id]/edit' options={{ title: "Edit Discount" }} />
			<Stack.Screen name='modifiers/index' options={{ headerShown: false }} />
			<Stack.Screen name='modifiers/picker' options={{ headerShown: false }} />
			<Stack.Screen name='modifiers/create' options={{ headerShown: false }} />
			<Stack.Screen name='modifiers/apply-set' options={{ headerShown: false }} />
			<Stack.Screen name='modifiers/[id]/index' options={{ title: "Modifier Details" }} />
			<Stack.Screen name='modifiers/[id]/edit' options={{ headerShown: false }} />
			<Stack.Screen name='modifiers/[id]/archive' options={{ title: "Archive Modifier Set" }} />
			<Stack.Screen name='modifiers/[id]/restore' options={{ title: "Restore Modifier Set" }} />
			<Stack.Screen name='units/add' options={{ title: "Unit Category", headerBackTitle: "Unit Type" }} />
			<Stack.Screen name='units/select' options={{ title: "Add Unit", headerBackTitle: "Add Unit" }} />
			<Stack.Screen
				name='units/custom-create'
				options={{ title: "Create Custom Unit", headerBackTitle: "Custom Unit" }}
			/>
			<Stack.Screen name='units/[id]/archive' options={{ title: "Archive Unit" }} />
			<Stack.Screen name='units/[id]/restore' options={{ title: "Restore Unit" }} />
			<Stack.Screen name='products/pos-tile' options={{ headerShown: false, animation: "none" }} />
			<Stack.Screen name='products/pos-tile-photo-library' options={{ headerShown: false, animation: "none" }} />
			<Stack.Screen name='products/pos-tile-recents' options={{ headerShown: false, animation: "none" }} />
			<Stack.Screen name='products/pos-tile-crop' options={{ headerShown: false, animation: "none" }} />

			{/* ✅ Item Details Overview — explicit back title */}
			<Stack.Screen
				name='products/[id]/index'
				options={{
					title: "Item Details Overview",
					headerBackTitle: "Inventory",
				}}
			/>
			<Stack.Screen name='products/[id]/edit' options={{ title: "Edit Item" }} />
			<Stack.Screen name='products/[id]/archive' options={{ title: "Archive Item" }} />

			<Stack.Screen
				name='products/[id]/activity/index'
				options={{ title: "Item Activity", headerBackTitle: "Item Details" }}
			/>
			<Stack.Screen name='products/[id]/adjust' options={{ title: "Adjust Stocks" }} />
			<Stack.Screen name='products/[id]/activity/[movementId]' options={{ title: "Activity Details" }} />
		</Stack>
	);
}
