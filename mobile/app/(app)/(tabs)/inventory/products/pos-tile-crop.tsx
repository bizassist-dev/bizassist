// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/products/pos-tile-crop.tsx

import { useResponsiveLayout } from "@/lib/layout/useResponsiveLayout";

import PosTileCropPhone from "./pos-tile-crop.phone";
import PosTileCropTablet from "./pos-tile-crop.tablet";

export default function PosTileCropIndex() {
	const { isTablet } = useResponsiveLayout();
	return isTablet ? <PosTileCropTablet /> : <PosTileCropPhone />;
}
