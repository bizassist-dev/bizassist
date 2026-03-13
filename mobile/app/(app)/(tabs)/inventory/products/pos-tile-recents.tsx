// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/products/pos-tile-recents.tsx

import { useResponsiveLayout } from "@/lib/layout/useResponsiveLayout";

import PosTileRecentsPhone from "./pos-tile-recents.phone";
import PosTileRecentsTablet from "./pos-tile-recents.tablet";

export default function PosTileRecentsIndex() {
	const { isTablet } = useResponsiveLayout();
	return isTablet ? <PosTileRecentsTablet /> : <PosTileRecentsPhone />;
}
