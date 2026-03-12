// BizAssist_mobile
// path: app/(app)/(tabs)/settings/scan.tsx

import { Stack } from "expo-router";

import InventoryScanScreen from "@/modules/inventory/screens/InventoryScanScreen";

export default function SettingsScanRoute() {
	return (
		<>
			<Stack.Screen options={{ animation: "fade", animationDuration: 180 }} />
			<InventoryScanScreen />
		</>
	);
}
