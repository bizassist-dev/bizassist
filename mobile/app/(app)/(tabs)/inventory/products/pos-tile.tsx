// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/products/pos-tile.tsx

import { useResponsiveLayout } from "@/lib/layout/useResponsiveLayout";

import PosTilePhone from "./pos-tile.phone";
import PosTileTablet from "./pos-tile.tablet";

export default function PosTileIndex() {
	const { isTablet } = useResponsiveLayout();
	return isTablet ? <PosTileTablet /> : <PosTilePhone />;
}
