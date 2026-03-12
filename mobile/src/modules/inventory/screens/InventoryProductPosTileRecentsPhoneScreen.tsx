// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/products/pos-tile-recents.phone.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, Pressable, StyleSheet, View, type ImageSourcePropType } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import * as MediaLibrary from "expo-media-library";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIInlineHeaderScaffold } from "@/components/ui/BAIInlineHeaderScaffold";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { InventoryPermissionModal } from "@/modules/inventory/components/InventoryPermissionModal";

import { useAppBusy } from "@/hooks/useAppBusy";
import { openAppSettings, requestMediaLibraryAccess } from "@/modules/inventory/inventory.permissions";
import {
	inventoryScopeRoot,
	mapInventoryRouteToScope,
	type InventoryRouteScope,
} from "@/modules/inventory/navigation.scope";
import {
	DRAFT_ID_KEY,
	POS_TILE_CROP_ROUTE,
	POS_TILE_PHOTO_LIBRARY_ROUTE,
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

const RECENTS_HARD_CAP = 60; // masterplan: “Recent Photos” grid uses hard cap of 60 newest images.
const DEV_MOCK_PHOTO_REPEAT_COUNT = 18;
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

export default function PosTileRecentsPhone({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const theme = useTheme();
	const { withBusy } = useAppBusy();
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const rootRoute = useMemo(() => inventoryScopeRoot(routeScope), [routeScope]);
	const scopedPosTileRoute = useMemo(() => toScopedRoute(POS_TILE_ROUTE), [toScopedRoute]);
	const scopedPhotoLibraryRoute = useMemo(() => toScopedRoute(POS_TILE_PHOTO_LIBRARY_ROUTE), [toScopedRoute]);
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

	const assetsQuery = useQuery({
		queryKey: ["posTile", "photoLibrary", "recents", { first: RECENTS_HARD_CAP }],
		enabled: hasPermission,
		staleTime: 30_000,
		queryFn: async () => {
			return MediaLibrary.getAssetsAsync({
				first: RECENTS_HARD_CAP,
				mediaType: [MediaLibrary.MediaType.photo],
				sortBy: [MediaLibrary.SortBy.creationTime],
			});
		},
	});

	const assets = useMemo(() => (assetsQuery.data?.assets ?? []) as MediaAsset[], [assetsQuery.data?.assets]);

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
			if (!productId) {
				router.replace(rootRoute as any);
				return;
			}
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
	}, [
		draftId,
		isItemPhotoMode,
		isUiDisabled,
		lockNav,
		productId,
		returnTo,
		rootRoute,
		rootReturnTo,
		router,
		tileLabelParam,
	]);

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
		if (isItemPhotoMode && !productId) {
			setSelectModalMessage("Unable to attach this photo. Please reopen the item.");
			setSelectModalOpen(true);
			return;
		}
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
		isItemPhotoMode,
		isUiDisabled,
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

	// masterplan: Recents routes into BizAssist Photo Library screen (not OS picker).
	const onOpenPhotoLibrary = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;

		router.replace({
			pathname: scopedPhotoLibraryRoute as any,
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
						[RETURN_TO_KEY]: scopedPosTileRoute,
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
		scopedPosTileRoute,
		tileLabelParam,
	]);

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const isPermissionBlocked = !!permission && !permission.granted && permission.canAskAgain === false;

	// Masterplan parity: keep Recents "live" after camera captures / library mutations.
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
		<BAIInlineHeaderScaffold title='Recent Photos' variant='back' onLeftPress={onBack} disabled={isUiDisabled}>
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
								intent='primary'
								variant='solid'
								shape='pill'
								size='sm'
								widthPreset='standard'
								onPress={onOpenPhotoLibrary}
								disabled={isUiDisabled}
								style={{ flex: 1 }}
							>
								Photo Library
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
					</BAISurface>

					{!hasPermission ? (
						<View style={styles.center}>
							<BAIText variant='title'>Allow Photo Access</BAIText>
							<BAIText variant='body' muted style={{ marginTop: 6, textAlign: "center" }}>
								We need access to your photo library to choose a POS tile photo.
							</BAIText>
							<BAIButton intent='primary' variant='solid' onPress={onRequestPermission} style={{ marginTop: 12 }}>
								Grant Access
							</BAIButton>
							{isPermissionBlocked ? (
								<BAIButton intent='primary' variant='outline' onPress={onOpenSettings} style={{ marginTop: 10 }}>
									Open Settings
								</BAIButton>
							) : null}
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
								Add photos to your device, then try again.
							</BAIText>
						</View>
					) : (
						<FlatList
							data={galleryItems}
							keyExtractor={(item) => item.id}
							numColumns={3}
							style={styles.gridList}
							contentContainerStyle={styles.grid}
							columnWrapperStyle={styles.gridRow}
							showsVerticalScrollIndicator={false}
							renderItem={({ item }) => {
								const selected = item.kind === "asset" && item.id === selectedId;
								const isMock = item.kind === "mock";
								return (
									<Pressable
										onPress={isMock ? undefined : () => setSelectedId(item.id)}
										disabled={isMock}
										style={[styles.tile, { borderColor: selected ? theme.colors.primary : borderColor }]}
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
					)}
				</View>
			</BAIScreen>

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
	center: { alignItems: "center", justifyContent: "center", paddingVertical: 24 },
	gridList: {
		flex: 1,
		minHeight: 0,
	},
	grid: { paddingTop: 6, paddingBottom: 4, alignItems: "center" },
	gridRow: { gap: 10, marginBottom: 10, justifyContent: "center" },
	tile: {
		width: "31%",
		aspectRatio: 1,
		borderWidth: 2,
		borderRadius: 14,
		overflow: "hidden",
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
