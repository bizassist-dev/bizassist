// BizAssist_mobile
// path: app/(app)/(tabs)/home/scan.tsx

import { Stack } from "expo-router";

import InventoryScanScreen from "@/modules/inventory/screens/InventoryScanScreen";

export default function HomeScanRoute() {
	return (
		<>
			<Stack.Screen options={{ animation: "fade", animationDuration: 180 }} />
			<InventoryScanScreen />
		</>
	);
}
