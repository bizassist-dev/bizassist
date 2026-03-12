// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/scan.tsx

import { Stack } from "expo-router";

import InventoryScanScreen from "@/modules/inventory/screens/InventoryScanScreen";

export default function InventoryScanRoute() {
	return (
		<>
			<Stack.Screen options={{ animation: "fade", animationDuration: 180 }} />
			<InventoryScanScreen />
		</>
	);
}
