// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/products/pos-tile-photo-library.phone.tsx
//
// Photo Library picker for POS Tile (Create Item flow)

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, Pressable, StyleSheet, View, type ImageSourcePropType } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import * as MediaLibrary from "expo-media-library";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIInlineHeaderScaffold } from "@/components/ui/BAIInlineHeaderScaffold";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIPressableRow } from "@/components/ui/BAIPressableRow";
import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { InventoryPermissionModal } from "@/modules/inventory/components/InventoryPermissionModal";

import { useAppBusy } from "@/hooks/useAppBusy";
import { mapInventoryRouteToScope, type InventoryRouteScope } from "@/modules/inventory/navigation.scope";
import {
	openAppSettings,
	requestCameraAccess,
	requestMediaLibraryAccess,
	requestPhotoLibraryAccess,
} from "@/modules/inventory/inventory.permissions";
import {
	DRAFT_ID_KEY,
	POS_TILE_CROP_ROUTE,
	POS_TILE_PHOTO_LIBRARY_ROUTE,
	POS_TILE_RECENTS_ROUTE,
	POS_TILE_ROUTE,
	RETURN_TO_KEY,
	ROOT_RETURN_TO_KEY,
	LOCAL_URI_KEY,
	TILE_LABEL_KEY,
	normalizeReturnTo,
	type PosTileInboundParams,
} from "@/modules/inventory/posTile.contract";

type MediaAsset = MediaLibrary.Asset;
type GalleryItem =
	| {
			kind: "asset";
			id: string;
			asset: MediaAsset;
			source: { uri: string };
	  }
	| {
			kind: "mock";
			id: string;
			source: ImageSourcePropType;
	  };

const LIBRARY_PAGE_SIZE = 100; // masterplan: OS Photo Library uses windowed pagination with 100 thumbnails per page.
const DEV_MOCK_PHOTO_REPEAT_COUNT = 18;
const TAB_DOCK_HEIGHT = 64;
const TAB_DOCK_BOTTOM_SAFE_REDUCTION = 8;
const FLOATING_RECENTS_GAP = 10;
const FLOATING_RECENTS_SPACER = 96;
const DEV_MOCK_PHOTO_SOURCES: ImageSourcePropType[] = [
	require("../../../../assets/images/logo1.jpg"),
	require("../../../../assets/images/logo1 copy.jpg"),
	require("../../../../assets/images/logo1.png"),
	require("../../../../assets/images/BizAssist-logo.png"),
	require("../../../../assets/images/BizAssist-logo1.png"),
	require("../../../../assets/images/BizAssist-logo2.png"),
];

function safeString(v: unknown): string {
	return typeof v === "string" ? v : String(v ?? "");
}

function clampAlpha(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex: string) {
	const cleaned = hex.replace("#", "").trim();
	if (cleaned.length === 3) {
		return {
			r: parseInt(cleaned[0] + cleaned[0], 16),
			g: parseInt(cleaned[1] + cleaned[1], 16),
			b: parseInt(cleaned[2] + cleaned[2], 16),
		};
	}
	if (cleaned.length === 6) {
		return {
			r: parseInt(cleaned.slice(0, 2), 16),
			g: parseInt(cleaned.slice(2, 4), 16),
			b: parseInt(cleaned.slice(4, 6), 16),
		};
	}
	return null;
}

function applyAlpha(color: string, alpha: number): string {
	const rgb = hexToRgb(color);
	if (!rgb) return color;
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clampAlpha(alpha)})`;
}

export default function PosTilePhotoLibraryPhone({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const theme = useTheme();
	const { withBusy } = useAppBusy();
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const scopedPosTileRoute = useMemo(() => toScopedRoute(POS_TILE_ROUTE), [toScopedRoute]);
	const scopedPhotoLibraryRoute = useMemo(() => toScopedRoute(POS_TILE_PHOTO_LIBRARY_ROUTE), [toScopedRoute]);
	const scopedRecentsRoute = useMemo(() => toScopedRoute(POS_TILE_RECENTS_ROUTE), [toScopedRoute]);
	const scopedCropRoute = useMemo(() => toScopedRoute(POS_TILE_CROP_ROUTE), [toScopedRoute]);

	const params = useLocalSearchParams<PosTileInboundParams>();
	const mode = safeString(params.mode).trim();
	const productId = safeString(params.productId).trim();
	const isItemPhotoMode = mode === "itemPhoto";

	const draftId = safeString(params[DRAFT_ID_KEY]).trim();
	const returnTo = normalizeReturnTo(params[RETURN_TO_KEY]) ?? scopedPosTileRoute;
	const rootReturnTo = normalizeReturnTo(params[ROOT_RETURN_TO_KEY]);
	const tileLabelParam = safeString(params[TILE_LABEL_KEY]);

	// --- nav lock (mandatory)
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

	const isUiDisabled = isNavLocked;

	const [permission, requestPermission] = MediaLibrary.usePermissions();
	const hasPermission = !!permission?.granted;

	// Initial page (window) via React Query; subsequent pages loaded via explicit “after” cursor calls.
	const assetsQuery = useQuery({
		queryKey: ["posTile", "photoLibrary", "paged", { first: LIBRARY_PAGE_SIZE }],
		enabled: hasPermission,
		staleTime: 30_000,
		queryFn: async () => {
			return MediaLibrary.getAssetsAsync({
				first: LIBRARY_PAGE_SIZE,
				mediaType: [MediaLibrary.MediaType.photo],
				sortBy: [MediaLibrary.SortBy.creationTime],
			});
		},
	});

	const [assets, setAssets] = useState<MediaAsset[]>([]);
	const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
	const [hasNextPage, setHasNextPage] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);

	// Reset/seed pagination state when the first page changes.
	useEffect(() => {
		if (!hasPermission) {
			setAssets([]);
			setEndCursor(undefined);
			setHasNextPage(false);
			return;
		}
		if (!assetsQuery.data) return;

		const pageAssets = (assetsQuery.data.assets ?? []) as MediaAsset[];
		setAssets(pageAssets);
		setEndCursor(assetsQuery.data.endCursor);
		setHasNextPage(!!assetsQuery.data.hasNextPage);
	}, [assetsQuery.data, hasPermission]);

	const loadMore = useCallback(async () => {
		if (!hasPermission) return;
		if (isUiDisabled) return;
		if (isLoadingMore) return;
		if (!hasNextPage) return;
		if (!endCursor) return;

		setIsLoadingMore(true);
		try {
			const next = await MediaLibrary.getAssetsAsync({
				first: LIBRARY_PAGE_SIZE,
				after: endCursor,
				mediaType: [MediaLibrary.MediaType.photo],
				sortBy: [MediaLibrary.SortBy.creationTime],
			});

			const nextAssets = (next.assets ?? []) as MediaAsset[];
			setAssets((prev) => {
				if (nextAssets.length === 0) return prev;
				// Avoid accidental duplicates on some Android devices when cursor boundary shifts.
				const seen = new Set(prev.map((a) => a.id));
				const deduped = nextAssets.filter((a) => !seen.has(a.id));
				return deduped.length ? [...prev, ...deduped] : prev;
			});
			setEndCursor(next.endCursor);
			setHasNextPage(!!next.hasNextPage);
		} finally {
			setIsLoadingMore(false);
		}
	}, [endCursor, hasNextPage, hasPermission, isLoadingMore, isUiDisabled]);

	const [selectedId, setSelectedId] = useState<string>("");
	const selectedAsset = useMemo(() => assets.find((a) => a.id === selectedId) ?? null, [assets, selectedId]);
	const mockGalleryItems = useMemo<GalleryItem[]>(() => {
		if (!__DEV__) return [];

		return Array.from({ length: DEV_MOCK_PHOTO_REPEAT_COUNT }, (_, index) => ({
			kind: "mock" as const,
			id: `mock-photo-${index + 1}`,
			source: DEV_MOCK_PHOTO_SOURCES[index % DEV_MOCK_PHOTO_SOURCES.length],
		}));
	}, []);
	const galleryItems = useMemo<GalleryItem[]>(() => {
		const assetItems: GalleryItem[] = assets.map((asset) => ({
			kind: "asset",
			id: asset.id,
			asset,
			source: { uri: asset.uri },
		}));

		return __DEV__ ? [...assetItems, ...mockGalleryItems] : assetItems;
	}, [assets, mockGalleryItems]);

	// If selection disappears due to refresh, clear it.
	useEffect(() => {
		if (!selectedId) return;
		const exists = assets.some((a) => a.id === selectedId);
		if (!exists) setSelectedId("");
	}, [assets, selectedId]);

	const [selectModalOpen, setSelectModalOpen] = useState(false);
	const [selectModalMessage, setSelectModalMessage] = useState("Please select a photo to continue.");
	const [selectModalAllowSettings, setSelectModalAllowSettings] = useState(false);

	const showSelectModal = useCallback((message: string, allowSettings = false) => {
		setSelectModalMessage(message);
		setSelectModalAllowSettings(allowSettings);
		setSelectModalOpen(true);
	}, []);

	const onBack = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;

		if ((router as any).canGoBack?.()) {
			router.back();
			return;
		}

		if (isItemPhotoMode) {
			router.replace({
				pathname: returnTo as any,
				params: {
					id: productId,
					[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
				},
			} as any);
			return;
		}

		router.replace({
			pathname: returnTo as any,
			params: {
				[DRAFT_ID_KEY]: draftId,
				[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
				[TILE_LABEL_KEY]: tileLabelParam,
			},
		} as any);
	}, [draftId, isItemPhotoMode, isUiDisabled, lockNav, productId, returnTo, rootReturnTo, router, tileLabelParam]);

	const onRequestPermission = useCallback(async () => {
		if (isUiDisabled) return;

		const state = await requestMediaLibraryAccess(requestPermission);
		if (state === "granted") return;

		if (state === "blocked") {
			showSelectModal("Photo access is blocked. Open Settings and allow Photos access for BizAssist.", true);
			return;
		}

		showSelectModal("Photo library permission is required.");
	}, [isUiDisabled, requestPermission, showSelectModal]);

	const onOpenSettings = useCallback(async () => {
		setSelectModalAllowSettings(false);
		setSelectModalOpen(false);
		const opened = await openAppSettings();
		if (opened) return;
		showSelectModal("Unable to open Settings right now. Please open Settings and allow Photos access for BizAssist.");
	}, [showSelectModal]);

	const onCloseSelectModal = useCallback(() => {
		setSelectModalAllowSettings(false);
		setSelectModalOpen(false);
	}, []);

	const onNext = useCallback(() => {
		if (isUiDisabled) return;
		if (!selectedAsset?.uri) {
			setSelectModalMessage("Please select a photo to continue.");
			setSelectModalOpen(true);
			return;
		}
		if (!lockNav()) return;

		void withBusy("Preparing photo...", async () => {
			let resolvedUri = selectedAsset.uri;
			try {
				const info = await MediaLibrary.getAssetInfoAsync(selectedAsset);
				const localUri = typeof info?.localUri === "string" ? info.localUri.trim() : "";
				if (localUri) resolvedUri = localUri;
			} catch {
				// fall back to asset uri
			}

			if (!resolvedUri || resolvedUri.startsWith("ph://")) {
				setSelectModalMessage("Unable to load this photo. Please choose another.");
				setSelectModalOpen(true);
				return;
			}

			router.replace({
				pathname: scopedCropRoute as any,
				params: isItemPhotoMode
					? {
							mode: "itemPhoto",
							productId,
							[LOCAL_URI_KEY]: resolvedUri,
							[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
							[RETURN_TO_KEY]: returnTo,
						}
					: {
							[DRAFT_ID_KEY]: draftId,
							[LOCAL_URI_KEY]: resolvedUri,
							[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
							[RETURN_TO_KEY]: scopedPosTileRoute,
							[TILE_LABEL_KEY]: tileLabelParam,
						},
			});
		});
	}, [
		draftId,
		isUiDisabled,
		isItemPhotoMode,
		lockNav,
		productId,
		returnTo,
		rootReturnTo,
		router,
		scopedCropRoute,
		scopedPosTileRoute,
		selectedAsset,
		tileLabelParam,
		withBusy,
	]);

	const onTakePhoto = useCallback(async () => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		try {
			const permissionState = await requestCameraAccess();
			if (permissionState !== "granted") {
				if (permissionState === "blocked") {
					showSelectModal("Camera access is blocked. Open Settings and allow Camera access for BizAssist.", true);
					return;
				}

				showSelectModal("Camera permission is required. You can select a photo from the library instead.");
				return;
			}

			const res = await ImagePicker.launchCameraAsync({
				mediaTypes: ["images"] as any,
				allowsEditing: false,
				quality: 1,
			});

			if (res.canceled) return;

			const asset = res.assets?.[0];
			if (!asset?.uri) return;

			router.replace({
				pathname: scopedCropRoute as any,
				params: isItemPhotoMode
					? {
							mode: "itemPhoto",
							productId,
							[LOCAL_URI_KEY]: asset.uri,
							[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
							[RETURN_TO_KEY]: returnTo,
						}
					: {
							[DRAFT_ID_KEY]: draftId,
							[LOCAL_URI_KEY]: asset.uri,
							[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
							[RETURN_TO_KEY]: scopedPosTileRoute,
							[TILE_LABEL_KEY]: tileLabelParam,
						},
			});
		} catch {
			showSelectModal("Camera is not available on this device. Use library photos instead.");
		}
	}, [
		draftId,
		isUiDisabled,
		isItemPhotoMode,
		lockNav,
		productId,
		returnTo,
		rootReturnTo,
		router,
		scopedCropRoute,
		scopedPosTileRoute,
		showSelectModal,
		tileLabelParam,
	]);

	const onPickFromGallery = useCallback(async () => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		try {
			const permissionState = await requestPhotoLibraryAccess();
			if (permissionState !== "granted") {
				if (permissionState === "blocked") {
					showSelectModal("Photo access is blocked. Open Settings and allow Photos access for BizAssist.", true);
					return;
				}

				showSelectModal("Photo library permission is required.");
				return;
			}

			const res = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ["images"] as any,
				allowsEditing: false,
				quality: 1,
			});

			if (res.canceled) return;

			const asset = res.assets?.[0];
			if (!asset?.uri) return;

			router.replace({
				pathname: scopedCropRoute as any,
				params: isItemPhotoMode
					? {
							mode: "itemPhoto",
							productId,
							[LOCAL_URI_KEY]: asset.uri,
							[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
							[RETURN_TO_KEY]: returnTo,
						}
					: {
							[DRAFT_ID_KEY]: draftId,
							[LOCAL_URI_KEY]: asset.uri,
							[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
							[RETURN_TO_KEY]: scopedPosTileRoute,
							[TILE_LABEL_KEY]: tileLabelParam,
						},
			});
		} catch {
			showSelectModal("Unable to open the photo library right now. Please try again.");
		}
	}, [
		draftId,
		isUiDisabled,
		isItemPhotoMode,
		lockNav,
		productId,
		returnTo,
		rootReturnTo,
		router,
		scopedCropRoute,
		scopedPosTileRoute,
		showSelectModal,
		tileLabelParam,
	]);

	const onOpenRecents = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;

		router.push({
			pathname: scopedRecentsRoute as any,
			params: isItemPhotoMode
				? {
						mode: "itemPhoto",
						productId,
						[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
						[RETURN_TO_KEY]: returnTo,
					}
				: {
						[DRAFT_ID_KEY]: draftId,
						[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
						[RETURN_TO_KEY]: scopedPhotoLibraryRoute,
						[TILE_LABEL_KEY]: tileLabelParam,
					},
		} as any);
	}, [
		draftId,
		isItemPhotoMode,
		isUiDisabled,
		lockNav,
		productId,
		returnTo,
		rootReturnTo,
		router,
		scopedPhotoLibraryRoute,
		scopedRecentsRoute,
		tileLabelParam,
	]);

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const floatingRecentsBottom =
		Math.max(insets.bottom - TAB_DOCK_BOTTOM_SAFE_REDUCTION, 2) + TAB_DOCK_HEIGHT + FLOATING_RECENTS_GAP;
	const floatingRecentsFill = applyAlpha(theme.colors.surface, theme.dark ? 0.74 : 0.84);
	const floatingRecentsBorder = applyAlpha(borderColor, theme.dark ? 0.78 : 0.56);
	const gridContentStyle = useMemo(
		() => [styles.grid, { paddingBottom: floatingRecentsBottom + FLOATING_RECENTS_SPACER }],
		[floatingRecentsBottom],
	);

	useEffect(() => {
		if (!hasPermission) return;

		let isActive = true;
		const subscription = MediaLibrary.addListener(() => {
			if (!isActive) return;
			assetsQuery.refetch();
		});

		const appStateSub = AppState.addEventListener("change", (state) => {
			if (state === "active") {
				assetsQuery.refetch();
			}
		});

		return () => {
			isActive = false;
			subscription.remove();
			appStateSub.remove();
		};
	}, [assetsQuery, hasPermission]);

	return (
		<BAIInlineHeaderScaffold
			title={isItemPhotoMode ? "Choose Photo" : "Photo Library"}
			variant='back'
			onLeftPress={onBack}
			disabled={isUiDisabled}
		>
			<BAIScreen
				padded={false}
				safeTop={false}
				safeBottom={false}
				safeAreaGradientBottom
				tabbed
				style={[styles.root, { backgroundColor: theme.colors.background }]}
			>
				<View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
					<BAISurface style={[styles.actionCard, { borderColor }]} padded={false} variant='interactive'>
						<View style={styles.topActions}>
							<BAIButton
								intent='neutral'
								variant='outline'
								shape='pill'
								size='sm'
								widthPreset='standard'
								onPress={onBack}
								disabled={isUiDisabled}
								style={{ flex: 1 }}
							>
								Cancel
							</BAIButton>
							<BAIButton
								intent='primary'
								variant='solid'
								shape='pill'
								size='sm'
								widthPreset='standard'
								onPress={onNext}
								disabled={isUiDisabled || !selectedAsset}
								style={{ flex: 1 }}
							>
								Next
							</BAIButton>
						</View>

						<View style={styles.secondaryActions}>
							<BAIButton
								intent='primary'
								variant='solid'
								shape='pill'
								size='sm'
								widthPreset='standard'
								iconLeft='image'
								onPress={onPickFromGallery}
								disabled={isUiDisabled}
								style={{ flex: 1 }}
								contentStyle={{ gap: 0 }}
							>
								Device Library
							</BAIButton>
							<BAIButton
								intent='primary'
								variant='solid'
								shape='pill'
								size='sm'
								widthPreset='standard'
								iconLeft='camera'
								onPress={onTakePhoto}
								disabled={isUiDisabled}
								style={{ flex: 1 }}
								contentStyle={{ gap: 0 }}
							>
								Camera
							</BAIButton>
						</View>
					</BAISurface>

					{!hasPermission ? (
						<View style={styles.center}>
							<BAIText variant='title'>Allow Photo Access</BAIText>
							<BAIText variant='body' muted style={{ marginTop: 6, textAlign: "center" }}>
								Allow Access to Choose a POS Tile Photo From Your Library.
							</BAIText>
							<BAIButton intent='primary' variant='solid' onPress={onRequestPermission} style={{ marginTop: 12 }}>
								Grant Access
							</BAIButton>
							<BAIButton
								intent='primary'
								variant='solid'
								onPress={onPickFromGallery}
								style={{ marginTop: 10 }}
								disabled={isUiDisabled}
							>
								Choose Library
							</BAIButton>
						</View>
					) : assetsQuery.isLoading ? (
						<View style={styles.center}>
							<BAIActivityIndicator />
						</View>
					) : assetsQuery.isError ? (
						<View style={styles.center}>
							<BAIText variant='title'>Unable to Load Photos</BAIText>
							<BAIRetryButton onPress={() => assetsQuery.refetch()} style={{ marginTop: 12 }} />
						</View>
					) : galleryItems.length === 0 ? (
						<View style={styles.center}>
							<BAIText variant='title'>No Photos Found</BAIText>
							<BAIText variant='body' muted style={{ marginTop: 6, textAlign: "center" }}>
								Add Photos to Your Device and Try Again.
							</BAIText>
						</View>
					) : (
						<>
							<FlatList
								data={galleryItems}
								keyExtractor={(item) => item.id}
								numColumns={3}
								style={styles.gridList}
								contentContainerStyle={gridContentStyle}
								columnWrapperStyle={styles.gridRow}
								showsVerticalScrollIndicator={false}
								onEndReachedThreshold={0.6}
								onEndReached={loadMore}
								ListFooterComponent={
									isLoadingMore ? (
										<View style={{ paddingVertical: 10 }}>
											<BAIActivityIndicator />
										</View>
									) : null
								}
								renderItem={({ item }) => {
									const selected = item.kind === "asset" && item.id === selectedId;
									const isMock = item.kind === "mock";
									return (
										<Pressable
											onPress={isMock ? undefined : () => setSelectedId(item.id)}
											disabled={isMock}
											style={[
												styles.tile,
												{ borderColor: selected ? theme.colors.primary : borderColor },
												isMock ? styles.mockTile : null,
											]}
										>
											<Image source={item.source} style={styles.tileImage} contentFit='cover' />
											{isMock ? (
												<View style={styles.mockBadge}>
													<BAIText variant='caption' style={styles.mockBadgeText}>
														Mock
													</BAIText>
												</View>
											) : null}
											{selected ? (
												<View style={styles.selectedBadge}>
													<MaterialCommunityIcons name='check' size={16} color='#FFFFFF' />
												</View>
											) : null}
										</Pressable>
									);
								}}
							/>
						</>
					)}
				</View>
			</BAIScreen>

			{hasPermission ? (
				<View pointerEvents='box-none' style={styles.floatingRecentsLayer}>
					<BAIPressableRow
						label='Recent'
						value='Photos'
						onPress={onOpenRecents}
						disabled={isUiDisabled}
						style={[
							styles.floatingRecentsRow,
							{
								bottom: floatingRecentsBottom,
								backgroundColor: floatingRecentsFill,
								borderColor: floatingRecentsBorder,
							},
						]}
					/>
				</View>
			) : null}

			<InventoryPermissionModal
				visible={selectModalOpen}
				message={selectModalMessage}
				borderColor={borderColor}
				onClose={onCloseSelectModal}
				allowSettings={selectModalAllowSettings}
				onOpenSettings={onOpenSettings}
			/>
		</BAIInlineHeaderScaffold>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	screen: { flex: 1, paddingHorizontal: 12, gap: 10 },
	actionCard: {
		borderWidth: 1,
		borderRadius: 24,
		padding: 12,
		gap: 10,
		marginBottom: 0,
	},
	topActions: {
		flexDirection: "row",
		gap: 10,
	},
	secondaryActions: {
		flexDirection: "row",
		gap: 10,
	},
	center: { alignItems: "center", justifyContent: "center", paddingVertical: 24 },
	gridList: {
		flex: 1,
		minHeight: 0,
	},
	grid: { paddingTop: 6, paddingBottom: 4, alignItems: "center" },
	gridRow: { gap: 10, marginBottom: 10, justifyContent: "center" },
	floatingRecentsLayer: {
		...StyleSheet.absoluteFillObject,
		pointerEvents: "box-none",
	},
	floatingRecentsRow: {
		position: "absolute",
		left: 12,
		right: 12,
		zIndex: 25,
		elevation: 10,
		shadowColor: "#000",
		shadowOpacity: 0.16,
		shadowRadius: 16,
		shadowOffset: { width: 0, height: 8 },
	},
	tile: {
		width: "31%",
		aspectRatio: 1,
		borderWidth: 2,
		borderRadius: 14,
		overflow: "hidden",
	},
	mockTile: {
		opacity: 0.8,
	},
	tileImage: { width: "100%", height: "100%" },
	mockBadge: {
		position: "absolute",
		left: 6,
		top: 6,
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: 999,
		backgroundColor: "rgba(17,24,39,0.78)",
	},
	mockBadgeText: {
		color: "#FFFFFF",
		fontWeight: "700",
	},
	selectedBadge: {
		position: "absolute",
		right: 6,
		top: 6,
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "#111827",
		alignItems: "center",
		justifyContent: "center",
	},
});
