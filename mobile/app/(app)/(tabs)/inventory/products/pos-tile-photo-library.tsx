// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/products/pos-tile-photo-library.tsx

import { useResponsiveLayout } from "@/lib/layout/useResponsiveLayout";

import PosTilePhotoLibraryPhone from "./pos-tile-photo-library.phone";
import PosTilePhotoLibraryTablet from "./pos-tile-photo-library.tablet";

export default function PosTilePhotoLibraryIndex() {
	const { isTablet } = useResponsiveLayout();
	return isTablet ? <PosTilePhotoLibraryTablet /> : <PosTilePhotoLibraryPhone />;
}
