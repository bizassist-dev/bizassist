// BizAssist_mobile
// path: app/(app)/(tabs)/pos/scan.tsx

import { Stack } from "expo-router";

import InventoryScanScreen from "@/modules/inventory/screens/InventoryScanScreen";

export default function PosScanRoute() {
	return (
		<>
			<Stack.Screen options={{ animation: "fade", animationDuration: 180 }} />
			<InventoryScanScreen />
		</>
	);
}
