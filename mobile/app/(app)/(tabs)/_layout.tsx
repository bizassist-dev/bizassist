// BizAssist_mobile
// path: app/(app)/(tabs)/_layout.tsx
//
// Tabs governance (locked):
// - Tabs are workspace selectors (folder nodes), not stack routes.
// - Always register canonical folder names: home | inventory | pos | settings.

import { Tabs } from "expo-router";

import { BAIBottomTabBar } from "@/components/navigation/BAIBottomTabBar";

export default function AppTabsLayout() {
	return (
		<Tabs
			initialRouteName='pos'
			screenOptions={{
				headerShown: false,
				popToTopOnBlur: true,
			}}
			tabBar={(props) => <BAIBottomTabBar {...props} />}
		>
			<Tabs.Screen name='pos' options={{ title: "POS" }} />
			<Tabs.Screen name='inventory' options={{ title: "Inventory" }} />
			<Tabs.Screen name='home/index' options={{ title: "Activity" }} />
			<Tabs.Screen name='settings' options={{ title: "Settings" }} />
		</Tabs>
	);
}
