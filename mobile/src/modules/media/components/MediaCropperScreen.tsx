// BizAssist_mobile
// path: src/modules/media/components/MediaCropperScreen.tsx
//
// Shared media cropper (POS tile + item photo).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQueryClient } from "@tanstack/react-query";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAICTAPillButton } from "@/components/ui/BAICTAButton";
import { BAIInlineHeaderScaffold } from "@/components/ui/BAIInlineHeaderScaffold";
import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";

import { useAppBusy } from "@/hooks/useAppBusy";
import type { InventoryScreenClass } from "@/modules/inventory/useInventoryHeader";
import { patchProductImageCaches } from "@/modules/inventory/inventory.cache";
import {
	inventoryScopeRoot,
	mapInventoryRouteToScope,
	type InventoryRouteScope,
} from "@/modules/inventory/navigation.scope";
import { POS_TILE_MIN_SIZE_PX } from "@/modules/media/media.constants";
import { toCacheBustedImageUri } from "@/modules/media/media.image";
import { uploadProductImage } from "@/modules/media/media.upload";
import { toMediaDomainError } from "@/modules/media/media.errors";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import { catalogKeys } from "@/modules/catalog/catalog.queries";
import { patchPosCatalogImageCaches } from "@/modules/pos/pos.catalog.cache";
import {
	DRAFT_ID_KEY,
	LOCAL_URI_KEY,
	RETURN_TO_KEY,
	ROOT_RETURN_TO_KEY,
	POS_TILE_ROUTE,
	TILE_LABEL_KEY,
	normalizeReturnTo,
	type PosTileInboundParams,
} from "@/modules/inventory/posTile.contract";

const TARGET_BYTES = 6 * 1024 * 1024; // 6 MB target
const HARD_BYTES = 8 * 1024 * 1024; // 8 MB hard cap
const MAX_DIMENSION = 2048; // long edge
const MIN_DIMENSION = POS_TILE_MIN_SIZE_PX;
const MAX_ZOOM = 3.0;
const CROP_SURFACE_HORIZONTAL_MARGIN = 12;

function clamp(val: number, min: number, max: number) {
	return Math.max(min, Math.min(max, val));
}

function clampInt(val: number, min: number, max: number) {
	const v = Math.round(val);
	return clamp(v, min, max);
}

async function getFileBytes(uri: string): Promise<number | null> {
	try {
		const info = await FileSystem.getInfoAsync(uri);
		const size = (info as { size?: number }).size;
		return typeof size === "number" ? size : null;
	} catch {
		return null;
	}
}

async function enforceOutputBudget(args: { uri: string; width: number; height: number }) {
	let currentUri = args.uri;
	let currentWidth = args.width;
	let currentHeight = args.height;

	let currentBytes = await getFileBytes(currentUri);
	if (!currentBytes) return { uri: currentUri, width: currentWidth, height: currentHeight };
	if (currentBytes <= TARGET_BYTES) return { uri: currentUri, width: currentWidth, height: currentHeight };

	for (let pass = 0; pass < 2 && currentBytes > TARGET_BYTES; pass += 1) {
		const ratio = Math.sqrt(TARGET_BYTES / currentBytes);
		const nextWidth = Math.max(MIN_DIMENSION, Math.floor(currentWidth * ratio));
		const nextHeight = Math.max(MIN_DIMENSION, Math.floor(currentHeight * ratio));

		if (nextWidth >= currentWidth && nextHeight >= currentHeight) break;

		const resized = await manipulateAsync(currentUri, [{ resize: { width: nextWidth, height: nextHeight } }], {
			compress: 0.85,
			format: SaveFormat.JPEG,
		});
		currentUri = resized.uri;
		currentWidth = resized.width ?? nextWidth;
		currentHeight = resized.height ?? nextHeight;
		currentBytes = (await getFileBytes(currentUri)) ?? currentBytes;
	}

	if (currentBytes > HARD_BYTES) {
		const ratio = Math.sqrt(HARD_BYTES / currentBytes);
		const nextWidth = Math.max(MIN_DIMENSION, Math.floor(currentWidth * ratio));
		const nextHeight = Math.max(MIN_DIMENSION, Math.floor(currentHeight * ratio));

		const resized = await manipulateAsync(currentUri, [{ resize: { width: nextWidth, height: nextHeight } }], {
			compress: 0.8,
			format: SaveFormat.JPEG,
		});
		currentUri = resized.uri;
		currentWidth = resized.width ?? nextWidth;
		currentHeight = resized.height ?? nextHeight;
	}

	return { uri: currentUri, width: currentWidth, height: currentHeight };
}

async function persistCropOutput(uri: string): Promise<string> {
	try {
		const baseDir = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}pos-tile/` : "";
		if (!baseDir) return uri;
		await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true }).catch(() => null);
		const filename = `pos_tile_${Date.now()}.jpg`;
		const target = `${baseDir}${filename}`;
		await FileSystem.copyAsync({ from: uri, to: target });
		return target;
	} catch {
		return uri;
	}
}

function safeString(v: unknown): string {
	return typeof v === "string" ? v : String(v ?? "");
}

const MODE_KEY = "mode" as const;
type CropMode = "posTile" | "itemPhoto";

type CropScreenProps = {
	frameMax: number;
	frameMin: number;
	aspectRatio?: number; // width / height
	headerTitle?: string;
	headerClass?: InventoryScreenClass;
	routeScope?: InventoryRouteScope;
};

export default function MediaCropperScreen({
	frameMax,
	frameMin,
	aspectRatio = 1,
	headerTitle = "Crop Photo",
	headerClass = "process",
	routeScope = "inventory",
}: CropScreenProps) {
	const router = useRouter();
	const theme = useTheme();
	const { withBusy } = useAppBusy();
	const qc = useQueryClient();
	const { width: screenWidth, height: screenHeight } = useWindowDimensions();
	const [surfaceWidth, setSurfaceWidth] = useState<number | null>(null);
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const rootRoute = useMemo(() => inventoryScopeRoot(routeScope), [routeScope]);

	type CropInboundParams = PosTileInboundParams & {
		[MODE_KEY]?: string;
		productId?: string;
		id?: string;
	};
	const params = useLocalSearchParams<CropInboundParams>();
	const modeParam = safeString(params[MODE_KEY]).trim();
	const cropMode: CropMode = modeParam === "itemPhoto" ? "itemPhoto" : "posTile";
	const isItemPhoto = cropMode === "itemPhoto";

	const draftId = safeString(params[DRAFT_ID_KEY]).trim();
	const localUri = safeString(params[LOCAL_URI_KEY]).trim();
	const productId = safeString(params.productId ?? params.id).trim();
	const returnTo =
		normalizeReturnTo(params[RETURN_TO_KEY]) ??
		(isItemPhoto ? toScopedRoute("/(app)/(tabs)/inventory/products/[id]/photo") : toScopedRoute(POS_TILE_ROUTE));
	const rootReturnTo = normalizeReturnTo(params[ROOT_RETURN_TO_KEY]);
	const tileLabelParam = safeString(params[TILE_LABEL_KEY]);

	const containerWidth = useMemo(
		() => Math.max(0, surfaceWidth ?? screenWidth - CROP_SURFACE_HORIZONTAL_MARGIN * 2),
		[screenWidth, surfaceWidth],
	);

	const frameWidth = useMemo(() => {
		const available = Math.max(0, containerWidth);
		const minResponsive = Math.min(frameMin, available);
		const maxResponsive = Math.min(frameMax, available);
		return Math.max(minResponsive, maxResponsive);
	}, [containerWidth, frameMax, frameMin]);
	const frameHeight = useMemo(() => Math.round(frameWidth / aspectRatio), [aspectRatio, frameWidth]);
	const framePaddingX = useMemo(() => Math.max(0, (containerWidth - frameWidth) / 2), [containerWidth, frameWidth]);
	const framePaddingY = useMemo(() => {
		// Keeps the cropper balanced across short and tall devices.
		const responsive = Math.round(screenHeight * 0.08);
		return clampInt(responsive, 44, 80);
	}, [screenHeight]);
	const stageWidth = frameWidth + framePaddingX * 2;
	const stageHeight = frameHeight + framePaddingY * 2;

	const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
	const [isImageReady, setIsImageReady] = useState(false);

	useEffect(() => {
		if (!localUri) {
			setImageSize(null);
			setIsImageReady(false);
			return;
		}
		let cancelled = false;
		setIsImageReady(false);
		Image.getSize(
			localUri,
			(w, h) => {
				if (cancelled) return;
				setImageSize({ width: w, height: h });
				setIsImageReady(true);
			},
			() => {
				if (cancelled) return;
				setImageSize(null);
				setIsImageReady(false);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [localUri]);

	const baseScale = useMemo(() => {
		if (!imageSize?.width || !imageSize?.height) return 1;
		return Math.max(frameWidth / imageSize.width, frameHeight / imageSize.height);
	}, [frameHeight, frameWidth, imageSize?.height, imageSize?.width]);

	const displaySize = useMemo(() => {
		if (!imageSize?.width || !imageSize?.height) return { width: 0, height: 0 };
		return {
			width: imageSize.width * baseScale,
			height: imageSize.height * baseScale,
		};
	}, [baseScale, imageSize?.height, imageSize?.width]);

	// --- Navigation lock (mandatory)
	const navLockRef = useRef(false);
	const [isNavLocked, setIsNavLocked] = useState(false);
	const lockNav = useCallback((ms = 800) => {
		if (navLockRef.current) return false;
		navLockRef.current = true;
		setIsNavLocked(true);
		setTimeout(() => {
			navLockRef.current = false;
			setIsNavLocked(false);
		}, ms);
		return true;
	}, []);

	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const canSubmit = useMemo(
		() =>
			Boolean(localUri && imageSize?.width && imageSize?.height) &&
			!isNavLocked &&
			(!isItemPhoto || Boolean(productId)),
		[imageSize?.height, imageSize?.width, isItemPhoto, isNavLocked, localUri, productId],
	);

	const onExit = useCallback(() => {
		if (!lockNav()) return;
		if (isItemPhoto) {
			if (returnTo && productId) {
				router.replace({
					pathname: returnTo as any,
					params: { id: productId },
				});
				return;
			}
			router.replace(rootRoute as any);
			return;
		}
		router.replace({
			pathname: returnTo as any,
			params: {
				[DRAFT_ID_KEY]: draftId,
				[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
				[TILE_LABEL_KEY]: tileLabelParam,
			},
		});
	}, [draftId, isItemPhoto, lockNav, productId, returnTo, rootReturnTo, rootRoute, router, tileLabelParam]);

	const onBack = useCallback(() => {
		if (isNavLocked) return;
		if (!lockNav()) return;

		if ((router as any).canGoBack?.()) {
			router.back();
			return;
		}

		if (isItemPhoto) {
			if (productId) {
				router.replace({
					pathname: returnTo as any,
					params: { id: productId },
				});
				return;
			}
			router.replace(rootRoute as any);
			return;
		}

		router.replace({
			pathname: returnTo as any,
			params: {
				[DRAFT_ID_KEY]: draftId,
				[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
				[TILE_LABEL_KEY]: tileLabelParam,
			},
		});
	}, [
		draftId,
		isItemPhoto,
		isNavLocked,
		lockNav,
		productId,
		returnTo,
		rootReturnTo,
		rootRoute,
		router,
		tileLabelParam,
	]);

	const headerVariant = headerClass === "process" ? "exit" : "back";

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const overlayShadeColor = "rgba(0,0,0,0.18)";
	const frameGuideColor = "#FFFFFF";
	const frameCornerSize = 28;
	const frameCornerThickness = 3;

	const scale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const startScale = useSharedValue(1);
	const startX = useSharedValue(0);
	const startY = useSharedValue(0);
	const frameWidthSV = useSharedValue(frameWidth);
	const frameHeightSV = useSharedValue(frameHeight);
	const displayWSV = useSharedValue(displaySize.width);
	const displayHSV = useSharedValue(displaySize.height);

	useEffect(() => {
		frameWidthSV.value = frameWidth;
		frameHeightSV.value = frameHeight;
		displayWSV.value = displaySize.width;
		displayHSV.value = displaySize.height;
		scale.value = 1;
		translateX.value = 0;
		translateY.value = 0;
	}, [
		displayHSV,
		displaySize.height,
		displaySize.width,
		displayWSV,
		frameHeight,
		frameHeightSV,
		frameWidth,
		frameWidthSV,
		scale,
		translateX,
		translateY,
	]);

	const panGesture = useMemo(() => {
		const getMaxOffset = (frame: number, display: number, s: number) => {
			"worklet";
			return Math.max(0, (display * s - frame) / 2);
		};
		const wClamp = (v: number, min: number, max: number) => {
			"worklet";
			return Math.max(min, Math.min(max, v));
		};

		return Gesture.Pan()
			.onBegin(() => {
				startX.value = translateX.value;
				startY.value = translateY.value;
			})
			.onUpdate((event) => {
				const maxX = getMaxOffset(frameWidthSV.value, displayWSV.value, scale.value);
				const maxY = getMaxOffset(frameHeightSV.value, displayHSV.value, scale.value);
				translateX.value = wClamp(startX.value + event.translationX, -maxX, maxX);
				translateY.value = wClamp(startY.value + event.translationY, -maxY, maxY);
			});
	}, [displayHSV, displayWSV, frameHeightSV, frameWidthSV, scale, startX, startY, translateX, translateY]);

	const pinchGesture = useMemo(() => {
		const getMaxOffset = (frame: number, display: number, s: number) => {
			"worklet";
			return Math.max(0, (display * s - frame) / 2);
		};
		const wClamp = (v: number, min: number, max: number) => {
			"worklet";
			return Math.max(min, Math.min(max, v));
		};

		return Gesture.Pinch()
			.onBegin(() => {
				startScale.value = scale.value;
			})
			.onUpdate((event) => {
				const nextScale = wClamp(startScale.value * event.scale, 1, MAX_ZOOM);
				scale.value = nextScale;
				const maxX = getMaxOffset(frameWidthSV.value, displayWSV.value, nextScale);
				const maxY = getMaxOffset(frameHeightSV.value, displayHSV.value, nextScale);
				translateX.value = wClamp(translateX.value, -maxX, maxX);
				translateY.value = wClamp(translateY.value, -maxY, maxY);
			});
	}, [displayHSV, displayWSV, frameHeightSV, frameWidthSV, scale, startScale, translateX, translateY]);

	const gesture = useMemo(() => Gesture.Simultaneous(panGesture, pinchGesture), [panGesture, pinchGesture]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
	}));

	const onReset = useCallback(() => {
		if (isNavLocked) return;
		scale.value = withTiming(1, { duration: 180 });
		translateX.value = withTiming(0, { duration: 180 });
		translateY.value = withTiming(0, { duration: 180 });
	}, [isNavLocked, scale, translateX, translateY]);

	const computeCrop = useCallback(() => {
		if (!imageSize?.width || !imageSize?.height) return null;
		if (!frameWidth || !frameHeight) return null;

		const currentScale = scale.value;
		const displayW = displaySize.width * currentScale;
		const displayH = displaySize.height * currentScale;
		const tx = translateX.value;
		const ty = translateY.value;

		const cropLeft = (displayW - frameWidth) / 2 - tx;
		const cropTop = (displayH - frameHeight) / 2 - ty;

		const cropWidth = frameWidth / (baseScale * currentScale);
		const cropHeight = frameHeight / (baseScale * currentScale);

		const originX = clamp(cropLeft / (baseScale * currentScale), 0, imageSize.width - cropWidth);
		const originY = clamp(cropTop / (baseScale * currentScale), 0, imageSize.height - cropHeight);

		return {
			originX: clampInt(originX, 0, Math.max(0, imageSize.width - cropWidth)),
			originY: clampInt(originY, 0, Math.max(0, imageSize.height - cropHeight)),
			width: clampInt(cropWidth, 1, imageSize.width),
			height: clampInt(cropHeight, 1, imageSize.height),
		};
	}, [
		baseScale,
		displaySize.height,
		displaySize.width,
		frameHeight,
		frameWidth,
		imageSize?.height,
		imageSize?.width,
		scale,
		translateX,
		translateY,
	]);

	const onDone = useCallback(async () => {
		if (!canSubmit) return;
		if (!lockNav()) return;
		setErrorMessage(null);

		await withBusy(isItemPhoto ? "Uploading photo..." : "Preparing photo...", async () => {
			const crop = computeCrop();
			if (!crop || !localUri) return;

			const actions: Parameters<typeof manipulateAsync>[1] = [
				{
					crop: {
						originX: crop.originX,
						originY: crop.originY,
						width: crop.width,
						height: crop.height,
					},
				},
			];

			const longEdge = Math.max(crop.width, crop.height);
			if (longEdge > MAX_DIMENSION) {
				const ratio = MAX_DIMENSION / longEdge;
				actions.push({
					resize: {
						width: Math.round(crop.width * ratio),
						height: Math.round(crop.height * ratio),
					},
				});
			} else if (longEdge < MIN_DIMENSION) {
				actions.push({
					resize: {
						width: MIN_DIMENSION,
						height: MIN_DIMENSION,
					},
				});
			}

			const cropped = await manipulateAsync(localUri, actions, { compress: 0.85, format: SaveFormat.JPEG });
			const finalOutput = await enforceOutputBudget({
				uri: cropped.uri,
				width: cropped.width ?? crop.width,
				height: cropped.height ?? crop.height,
			});

			if (isItemPhoto) {
				if (!productId) return;
				try {
					const uploaded = await uploadProductImage({
						imageKind: "PRIMARY_POS_TILE",
						localUri: finalOutput.uri,
						productId,
						isPrimary: true,
						sortOrder: 0,
					});

					const nextUpdatedAt = new Date().toISOString();
					const nextPrimaryImageUrl = toCacheBustedImageUri(uploaded.publicUrl, nextUpdatedAt);
					patchProductImageCaches(qc, productId, {
						primaryImageUrl: nextPrimaryImageUrl,
						updatedAt: nextUpdatedAt,
					});
					patchPosCatalogImageCaches(qc, {
						productId,
						primaryImageUrl: nextPrimaryImageUrl,
						updatedAt: nextUpdatedAt,
					});

					await Promise.all([
						qc.invalidateQueries({ queryKey: inventoryKeys.productDetail(productId) }),
						qc.invalidateQueries({ queryKey: inventoryKeys.productsRoot() }),
						qc.invalidateQueries({ queryKey: inventoryKeys.productsInfiniteRoot() }),
						qc.invalidateQueries({ queryKey: ["pos", "catalog", "products"] }),
						qc.invalidateQueries({ queryKey: catalogKeys.all }),
					]);

					const successReturnTo = rootReturnTo ?? returnTo;
					router.replace({
						pathname: successReturnTo as any,
						params: { id: productId, [LOCAL_URI_KEY]: finalOutput.uri },
					});
				} catch (e) {
					const domain = toMediaDomainError(e);
					setErrorMessage(domain.message);
				}
				return;
			}

			const persistedUri = await persistCropOutput(finalOutput.uri);
			router.replace({
				pathname: returnTo as any,
				params: {
					[DRAFT_ID_KEY]: draftId,
					[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
					[LOCAL_URI_KEY]: persistedUri,
					[TILE_LABEL_KEY]: tileLabelParam,
				},
			});
		});
	}, [
		canSubmit,
		computeCrop,
		draftId,
		isItemPhoto,
		localUri,
		lockNav,
		productId,
		qc,
		returnTo,
		rootReturnTo,
		router,
		tileLabelParam,
		withBusy,
	]);

	const onSurfaceLayout = useCallback(
		(event: LayoutChangeEvent) => {
			const nextWidth = Math.round(event.nativeEvent.layout.width);
			setSurfaceWidth((prev) => (prev === nextWidth ? prev : nextWidth));
		},
		[setSurfaceWidth],
	);

	return (
		<BAIInlineHeaderScaffold
			title={headerTitle}
			variant={headerVariant}
			onLeftPress={headerVariant === "back" ? onBack : onExit}
			disabled={isNavLocked}
		>
			<BAIScreen
				padded={false}
				tabbed
				scroll
				safeTop={false}
				style={[styles.root, { backgroundColor: theme.colors.background }]}
				scrollProps={{ showsVerticalScrollIndicator: false }}
			>
				<BAISurface style={[styles.surface, { borderColor }]} padded>
					<View style={styles.surfaceContent} onLayout={onSurfaceLayout}>
						<BAIText variant='body' muted style={styles.muted}>
							Pinch to zoom and drag to position.
						</BAIText>

						<View style={[styles.previewClip, { width: stageWidth, height: stageHeight }]}>
							<View style={[styles.previewStage, { width: stageWidth, height: stageHeight }]}>
								{localUri ? (
									isImageReady && displaySize.width > 0 ? (
										<GestureDetector gesture={gesture}>
											<Animated.View style={[styles.imageWrap, animatedStyle]}>
												<Image
													source={{ uri: localUri }}
													style={{ width: displaySize.width, height: displaySize.height }}
													resizeMode='cover'
												/>
											</Animated.View>
										</GestureDetector>
									) : (
										<View style={styles.previewEmpty}>
											<BAIActivityIndicator />
										</View>
									)
								) : (
									<View style={styles.previewEmpty}>
										<BAIText variant='body' muted>
											No photo selected
										</BAIText>
									</View>
								)}
								<View pointerEvents='none' style={styles.overlayLayer}>
									<View
										style={[
											styles.overlayShade,
											{
												left: 0,
												top: 0,
												right: 0,
												height: framePaddingY,
												backgroundColor: overlayShadeColor,
											},
										]}
									/>
									<View
										style={[
											styles.overlayShade,
											{
												left: 0,
												bottom: 0,
												right: 0,
												height: framePaddingY,
												backgroundColor: overlayShadeColor,
											},
										]}
									/>
									<View
										style={[
											styles.overlayShade,
											{
												left: 0,
												top: framePaddingY,
												bottom: framePaddingY,
												width: framePaddingX,
												backgroundColor: overlayShadeColor,
											},
										]}
									/>
									<View
										style={[
											styles.overlayShade,
											{
												right: 0,
												top: framePaddingY,
												bottom: framePaddingY,
												width: framePaddingX,
												backgroundColor: overlayShadeColor,
											},
										]}
									/>
								</View>
								<View
									pointerEvents='none'
									style={[
										styles.previewFrame,
										{
											width: frameWidth,
											height: frameHeight,
											borderWidth: 1,
											borderColor: "rgba(255,255,255,0.25)",
											backgroundColor: "rgba(255,255,255,0.06)",
										},
									]}
								>
									<View style={[styles.frameGuides, { width: frameWidth, height: frameHeight }]}>
										<View
											style={[
												styles.frameCorner,
												styles.cornerTL,
												{
													borderColor: frameGuideColor,
													width: frameCornerSize,
													height: frameCornerSize,
													borderTopWidth: frameCornerThickness,
													borderLeftWidth: frameCornerThickness,
													borderTopLeftRadius: 8,
												},
											]}
										/>
										<View
											style={[
												styles.frameCorner,
												styles.cornerTR,
												{
													borderColor: frameGuideColor,
													width: frameCornerSize,
													height: frameCornerSize,
													borderTopWidth: frameCornerThickness,
													borderRightWidth: frameCornerThickness,
													borderTopRightRadius: 8,
												},
											]}
										/>
										<View
											style={[
												styles.frameCorner,
												styles.cornerBL,
												{
													borderColor: frameGuideColor,
													width: frameCornerSize,
													height: frameCornerSize,
													borderBottomWidth: frameCornerThickness,
													borderLeftWidth: frameCornerThickness,
													borderBottomLeftRadius: 8,
												},
											]}
										/>
										<View
											style={[
												styles.frameCorner,
												styles.cornerBR,
												{
													borderColor: frameGuideColor,
													width: frameCornerSize,
													height: frameCornerSize,
													borderBottomWidth: frameCornerThickness,
													borderRightWidth: frameCornerThickness,
													borderBottomRightRadius: 8,
												},
											]}
										/>
									</View>
								</View>
							</View>
						</View>

						{errorMessage ? (
							<BAIText variant='caption' style={[styles.actionsHelper, { color: theme.colors.error }]}>
								{errorMessage}
							</BAIText>
						) : (
							<BAIText variant='caption' muted style={styles.actionsHelper}>
								Reset to center or use photo to continue.
							</BAIText>
						)}
						<View style={styles.actions}>
							<BAICTAPillButton
								intent='primary'
								variant='solid'
								onPress={onReset}
								disabled={isNavLocked || !localUri}
								style={styles.actionButton}
							>
								Reset
							</BAICTAPillButton>
							<BAICTAPillButton
								intent='primary'
								variant='solid'
								onPress={onDone}
								disabled={!canSubmit}
								style={styles.actionButton}
							>
								Use photo
							</BAICTAPillButton>
						</View>
					</View>
				</BAISurface>
			</BAIScreen>
		</BAIInlineHeaderScaffold>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	surface: {
		marginHorizontal: CROP_SURFACE_HORIZONTAL_MARGIN,
		marginTop: 0,
		marginBottom: 100,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 18,
		alignItems: "center",
		paddingHorizontal: 0,
	},
	surfaceContent: {
		width: "100%",
		alignItems: "center",
	},
	title: { marginBottom: 6 },
	muted: { marginBottom: 12 },
	previewClip: {
		marginBottom: 16,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 0,
	},
	previewStage: {
		overflow: "visible",
		alignItems: "center",
		justifyContent: "center",
	},
	previewFrame: {
		position: "absolute",
		borderWidth: 0,
		borderRadius: 0,
		overflow: "hidden",
	},
	frameGuides: {
		position: "absolute",
		top: 0,
		left: 0,
	},
	frameCorner: {
		position: "absolute",
	},
	cornerTL: { top: 14, left: 14 },
	cornerTR: { top: 14, right: 14 },
	cornerBL: { bottom: 14, left: 14 },
	cornerBR: { bottom: 14, right: 14 },
	overlayLayer: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	overlayShade: {
		position: "absolute",
	},
	imageWrap: {
		alignItems: "center",
		justifyContent: "center",
	},
	previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
	actionsHelper: { marginBottom: 16, textAlign: "left", alignSelf: "flex-start", paddingHorizontal: 16 },
	actions: { gap: 10, width: "100%", paddingHorizontal: 16, flexDirection: "row" },
	actionButton: {
		flex: 1,
	},
});
