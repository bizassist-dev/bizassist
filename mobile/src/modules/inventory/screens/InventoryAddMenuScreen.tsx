// BizAssist_mobile
// path: src/modules/inventory/screens/InventoryAddMenuScreen.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "react-native-paper";

import { BAIInlineHeaderScaffold } from "@/components/ui/BAIInlineHeaderScaffold";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { AddMenuList, type AddMenuListItem } from "@/components/system/AddMenuList";

import {
	inventoryScopeRoot,
	mapInventoryRouteToScope,
	type InventoryRouteScope,
} from "@/modules/inventory/navigation.scope";

export default function InventoryAddMenu({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const theme = useTheme();
	const inventoryRootRoute = inventoryScopeRoot(routeScope);
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);

	// --- Navigation lock (mandatory)
	const navLockRef = useRef(false);
	const [isNavLocked, setIsNavLocked] = useState(false);

	const lockNav = useCallback((ms = 650) => {
		if (navLockRef.current) return false;

		navLockRef.current = true;
		setIsNavLocked(true);

		setTimeout(() => {
			navLockRef.current = false;
			setIsNavLocked(false);
		}, ms);

		return true;
	}, []);

	const onExit = useCallback(() => {
		if (!lockNav()) return;
		router.replace(inventoryRootRoute as any);
	}, [inventoryRootRoute, lockNav, router]);

	const safePush = useCallback(
		(path: string) => {
			if (!lockNav()) return;
			router.push(path as any);
		},
		[lockNav, router],
	);

	// Phase 1: Items-first. Categories lifecycle is owned by Settings.
	const menuItems: AddMenuListItem[] = useMemo(
		() => [
			{
				key: "physical",
				label: "Items",
				subtitle: "Create a stock-tracked item.",
				icon: "package-variant-closed",
				iconSize: 21,
				onPress: () => safePush(toScopedRoute("/(app)/(tabs)/inventory/products/create")),
				enabled: true,
			},
			{
				key: "service",
				label: "Services",
				subtitle: "Create and manage sellable services.",
				iconFamily: "ion",
				icon: "briefcase-outline",
				onPress: () => safePush(toScopedRoute("/(app)/(tabs)/inventory/services/create")),
				enabled: true,
			},
			{
				key: "discount",
				label: "Discounts",
				subtitle: "Manage discounts for POS pricing.",
				iconFamily: "ion",
				icon: "pricetag-outline",
				onPress: () => safePush(toScopedRoute("/(app)/(tabs)/inventory/discounts/discount.ledger")),
				enabled: true,
			},
			{
				key: "category",
				label: "Categories",
				subtitle: "Select from category list.",
				iconFamily: "ion",
				icon: "layers-outline",
				onPress: () => safePush(toScopedRoute("/(app)/(tabs)/inventory/categories/category.ledger")),
				enabled: true,
			},
			...(routeScope === "inventory"
				? ([
						{
							key: "modifiers",
							label: "Modifiers",
							subtitle: "Create and manage modifier sets.",
							icon: "view-grid-outline",
							onPress: () => safePush("/(app)/(tabs)/inventory/modifiers"),
							enabled: true,
						},
					] satisfies AddMenuListItem[])
				: []),
		],
		[routeScope, safePush, toScopedRoute],
	);

	const dividerColor = theme.colors.outlineVariant ?? theme.colors.outline;

	return (
		<BAIInlineHeaderScaffold
			title='Create New'
			variant='exit'
			onLeftPress={onExit}
			disabled={isNavLocked}
		>
			<BAIScreen padded={false} safeTop={false} style={styles.root}>
				<View style={styles.screen}>
					<BAISurface style={[styles.card, { borderColor: dividerColor }]} padded={false}>
						<View style={styles.cardBody}>
							<AddMenuList items={menuItems} disabled={isNavLocked} />
						</View>
					</BAISurface>
				</View>
			</BAIScreen>
		</BAIInlineHeaderScaffold>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	screen: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },

	card: {
		backgroundColor: "transparent",
		borderWidth: 0,
		overflow: "visible",
	},

	cardBody: {
		padding: 0,
	},
});
