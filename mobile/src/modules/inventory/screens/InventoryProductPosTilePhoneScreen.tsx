// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/products/pos-tile.phone.tsx
//
// POS Tile Editor (Create Item flow)
// Governance:
// - Process screen (Exit cancels intent).
// - Changes are staged locally until Save.
// - Deterministic return via rootReturnTo param.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Keyboard, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as ImagePicker from "expo-image-picker";
import { FontAwesome6 } from "@expo/vector-icons";

import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIIconButton } from "@/components/ui/BAIIconButton";
import { BAIGroupTabs, type BAIGroupTab } from "@/components/ui/BAIGroupTabs";
import { BAITextInput } from "@/components/ui/BAITextInput";
import { InventoryPermissionModal } from "@/modules/inventory/components/InventoryPermissionModal";

import { useInventoryHeader } from "@/modules/inventory/useInventoryHeader";
import {
	inventoryScopeRoot,
	mapInventoryRouteToScope,
	type InventoryRouteScope,
} from "@/modules/inventory/navigation.scope";
import { openAppSettings, requestCameraAccess } from "@/modules/inventory/inventory.permissions";
import { useProcessExitGuard } from "@/modules/navigation/useProcessExitGuard";
import { posTileLabelRegex } from "@/shared/validation/patterns";
import { useProductCreateDraft } from "@/modules/inventory/drafts/useProductCreateDraft";
import { PosTileColorSelector } from "@/modules/inventory/components/PosTileColorSelector";
import {
	DRAFT_ID_KEY,
	LOCAL_URI_KEY,
	POS_TILE_CROP_ROUTE,
	POS_TILE_PHOTO_LIBRARY_ROUTE,
	POS_TILE_ROUTE,
	ROOT_RETURN_TO_KEY,
	RETURN_TO_KEY,
	TILE_LABEL_KEY,
	normalizeReturnTo,
	type PosTileInboundParams,
} from "@/modules/inventory/posTile.contract";
import { FIELD_LIMITS } from "@/shared/fieldLimits";

type PosTileTab = "IMAGE" | "COLOR";
const TABS: BAIGroupTab<PosTileTab>[] = [
	{ label: "Photo", value: "IMAGE" },
	{ label: "Color", value: "COLOR" },
];

function safeString(v: unknown): string {
	return typeof v === "string" ? v : String(v ?? "");
}

function validateOptionalPosTileLabel(label: string): string | null {
	const trimmed = label.trim();
	if (!trimmed) return null;
	if (trimmed.length < FIELD_LIMITS.posTileLabelMin) {
		return `Use at least ${FIELD_LIMITS.posTileLabelMin} characters.`;
	}
	if (!posTileLabelRegex.test(trimmed)) {
		return "Letters and numbers only.";
	}
	return null;
}

export default function PosTilePhoneScreen({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const theme = useTheme();
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const rootRoute = useMemo(() => inventoryScopeRoot(routeScope), [routeScope]);
	const posTileRoute = useMemo(() => toScopedRoute(POS_TILE_ROUTE), [toScopedRoute]);

	const params = useLocalSearchParams<PosTileInboundParams>();
	const draftId = safeString(params[DRAFT_ID_KEY]).trim();
	const rootReturnTo =
		normalizeReturnTo(params[ROOT_RETURN_TO_KEY]) ?? normalizeReturnTo(params[RETURN_TO_KEY]) ?? null;
	const inboundTileLabel = safeString(params[TILE_LABEL_KEY]);

	const { draft, patch } = useProductCreateDraft(draftId);

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
	const initialTileLabelRef = useRef(inboundTileLabel || draft.posTileLabel || "");
	const initialTileModeRef = useRef<PosTileTab>("IMAGE");
	const initialTileColorRef = useRef<string | null>(draft.posTileColor ?? null);
	const initialTileImageUriRef = useRef((draft.imageLocalUri ?? "").trim());

	const [tileLabel, setTileLabel] = useState(() => initialTileLabelRef.current);
	const [tileMode, setTileMode] = useState<PosTileTab>(() => initialTileModeRef.current);
	const [tileColor, setTileColor] = useState<string | null>(() => initialTileColorRef.current);
	const [tileImageUri, setTileImageUri] = useState(() => initialTileImageUriRef.current);
	const [deletedTileImageUri, setDeletedTileImageUri] = useState<string>("");
	const [cameraModalOpen, setCameraModalOpen] = useState(false);
	const [cameraModalMessage, setCameraModalMessage] = useState("");
	const [cameraModalAllowSettings, setCameraModalAllowSettings] = useState(false);
	const tileLabelPlaceholder = useMemo(() => `Optional, Up to ${FIELD_LIMITS.posTileLabel} Characters`, []);

	const incomingLocalUri = useMemo(() => safeString(params[LOCAL_URI_KEY]).trim(), [params]);
	const incomingTileLabelParam = (params as any)?.[TILE_LABEL_KEY];
	const hasIncomingTileLabelKey = incomingTileLabelParam !== undefined;
	const incomingTileLabel = useMemo(() => safeString(incomingTileLabelParam), [incomingTileLabelParam]);

	useEffect(() => {
		if (!incomingLocalUri) return;
		setTileImageUri(incomingLocalUri);
		setDeletedTileImageUri("");
		setTileMode("IMAGE");
		(router as any).setParams?.({ [LOCAL_URI_KEY]: undefined });
	}, [incomingLocalUri, router]);

	useEffect(() => {
		if (!hasIncomingTileLabelKey) return;
		const incomingTrimmed = incomingTileLabel.trim();
		const draftLabel = safeString(draft.posTileLabel);

		// Empty incoming params should not erase an existing saved/draft label.
		if (incomingTrimmed.length > 0 || !draftLabel.trim()) {
			setTileLabel(incomingTileLabel);
			patch({ posTileLabel: incomingTileLabel });
		} else {
			setTileLabel(draftLabel);
		}
		(router as any).setParams?.({ [TILE_LABEL_KEY]: undefined });
	}, [draft.posTileLabel, hasIncomingTileLabelKey, incomingTileLabel, patch, router]);

	useEffect(() => {
		if (hasIncomingTileLabelKey) return;
		const draftLabel = safeString(draft.posTileLabel);
		if (!tileLabel.trim() && draftLabel.trim()) {
			setTileLabel(draftLabel);
		}
	}, [draft.posTileLabel, hasIncomingTileLabelKey, tileLabel]);

	const tabBarHeight = useBottomTabBarHeight();
	const screenBottomPad = tabBarHeight + 12;

	const onExit = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		if (rootReturnTo) {
			router.replace({ pathname: rootReturnTo as any, params: { [DRAFT_ID_KEY]: draftId } } as any);
			return;
		}
		router.replace(rootRoute as any);
	}, [draftId, isUiDisabled, lockNav, rootReturnTo, rootRoute, router]);
	const guardedOnExit = useProcessExitGuard(onExit);

	const headerOptions = useInventoryHeader("process", {
		title: "Edit POS Tile",
		disabled: isUiDisabled,
		onExit: guardedOnExit,
		exitFallbackRoute: "/(app)/(tabs)/inventory",
		showAvatarPlaceholder: true,
	});

	const showCameraModal = useCallback((message: string, allowSettings = false) => {
		setCameraModalMessage(message);
		setCameraModalAllowSettings(allowSettings);
		setCameraModalOpen(true);
	}, []);

	const onCloseCameraModal = useCallback(() => {
		setCameraModalAllowSettings(false);
		setCameraModalOpen(false);
	}, []);

	const onOpenSettings = useCallback(async () => {
		setCameraModalAllowSettings(false);
		setCameraModalOpen(false);
		const opened = await openAppSettings();
		if (opened) return;
		showCameraModal("Unable to open Settings right now. Please open Settings and allow Camera access for BizAssist.");
	}, [showCameraModal]);

	const onSave = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;

		const trimmedLabel = tileLabel.trim();
		const tileLabelError = validateOptionalPosTileLabel(trimmedLabel);
		if (tileLabelError) {
			return;
		}

		patch({
			posTileLabel: trimmedLabel,
			posTileLabelTouched: true,
			imageLocalUri: tileImageUri,
			posTileMode: tileMode,
			posTileColor: tileColor ?? null,
		});

		if (rootReturnTo) {
			router.replace({ pathname: rootReturnTo as any, params: { [DRAFT_ID_KEY]: draftId } } as any);
			return;
		}
		router.replace(rootRoute as any);
	}, [
		draftId,
		isUiDisabled,
		lockNav,
		patch,
		rootReturnTo,
		rootRoute,
		router,
		tileColor,
		tileImageUri,
		tileLabel,
		tileMode,
	]);

	const onChooseFromLibrary = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;

		router.push({
			pathname: toScopedRoute(POS_TILE_PHOTO_LIBRARY_ROUTE) as any,
			params: {
				[DRAFT_ID_KEY]: draftId,
				[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
				[RETURN_TO_KEY]: posTileRoute,
				[TILE_LABEL_KEY]: tileLabel,
			},
		});
	}, [draftId, isUiDisabled, lockNav, posTileRoute, rootReturnTo, router, tileLabel, toScopedRoute]);

	const onTakePhoto = useCallback(async () => {
		if (isUiDisabled) return;
		if (!lockNav()) return;

		try {
			const permissionState = await requestCameraAccess();
			if (permissionState !== "granted") {
				if (permissionState === "blocked") {
					showCameraModal("Camera access is blocked. Open Settings and allow Camera access for BizAssist.", true);
					return;
				}

				showCameraModal("Camera permission is required. You can use Photo Library instead.");
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
				pathname: toScopedRoute(POS_TILE_CROP_ROUTE) as any,
				params: {
					[DRAFT_ID_KEY]: draftId,
					[LOCAL_URI_KEY]: asset.uri,
					[ROOT_RETURN_TO_KEY]: rootReturnTo ?? "",
					[RETURN_TO_KEY]: posTileRoute,
					[TILE_LABEL_KEY]: tileLabel,
				},
			});
		} catch {
			showCameraModal("Camera is not available on this device. Use library photos instead.");
		}
	}, [draftId, isUiDisabled, lockNav, posTileRoute, rootReturnTo, router, showCameraModal, tileLabel, toScopedRoute]);

	const onRemoveImage = useCallback(() => {
		if (isUiDisabled) return;
		const removedImageUri = tileImageUri.trim();
		if (!removedImageUri) return;

		setTileImageUri("");
		setDeletedTileImageUri(removedImageUri);
	}, [isUiDisabled, tileImageUri]);

	const onRestoreImage = useCallback(() => {
		if (isUiDisabled) return;
		const restoreImageUri = deletedTileImageUri.trim();
		if (!restoreImageUri) return;

		setTileImageUri((current) => (current.trim() ? current : restoreImageUri));
		setDeletedTileImageUri("");
	}, [deletedTileImageUri, isUiDisabled]);

	const hasImage = !!tileImageUri;
	const hasDeletedImage = deletedTileImageUri.trim().length > 0;
	const imageActionDisabled = isUiDisabled || (!hasImage && !hasDeletedImage);
	const isUndoState = hasDeletedImage && !hasImage;
	const imageActionIcon = isUndoState ? "undo-variant" : "trash-can-outline";
	const imageActionLabel = isUndoState ? "Undo remove photo" : "Remove photo";
	const imageActionIconColor = isUndoState
		? (theme.colors.onPrimary ?? "#FFFFFF")
		: ((theme.colors as any).onError ?? "#FFFFFF");
	const imageActionBackgroundColor = isUndoState ? theme.colors.primary : theme.colors.error;
	const isTileLabelValid = useMemo(() => {
		return validateOptionalPosTileLabel(tileLabel) == null;
	}, [tileLabel]);
	const tileLabelErrorText = useMemo(() => validateOptionalPosTileLabel(tileLabel), [tileLabel]);
	const hasChanges = useMemo(() => {
		const currentLabel = tileLabel.trim();
		const initialLabel = initialTileLabelRef.current.trim();
		const currentImageUri = tileImageUri.trim();
		const initialImageUri = initialTileImageUriRef.current;

		return (
			currentLabel !== initialLabel ||
			tileMode !== initialTileModeRef.current ||
			(tileColor ?? null) !== initialTileColorRef.current ||
			currentImageUri !== initialImageUri
		);
	}, [tileColor, tileImageUri, tileLabel, tileMode]);

	return (
		<>
			<Stack.Screen
				options={{
					...headerOptions,
					headerShadowVisible: false,
				}}
			/>

			<BAIScreen padded={false} safeTop={false} safeBottom={false} style={styles.root}>
				<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
					<View style={[styles.screen, { backgroundColor: theme.colors.background, paddingBottom: screenBottomPad }]}>
						<BAISurface
							style={[styles.card, { borderColor: theme.colors.outlineVariant ?? theme.colors.outline }]}
							padded
						>
							<BAITextInput
								label='Tile Label'
								value={tileLabel}
								onChangeText={(t) => {
									const cleaned = t.replace(/[^A-Za-z0-9 ]/g, "");
									setTileLabel(cleaned);
									patch({ posTileLabel: cleaned, posTileLabelTouched: true });
								}}
								maxLength={FIELD_LIMITS.posTileLabel}
								placeholder={tileLabelPlaceholder}
								disabled={isUiDisabled}
							/>
							{!isTileLabelValid && tileLabelErrorText ? (
								<BAIText variant='caption' style={{ color: theme.colors.error }}>
									{tileLabelErrorText}
								</BAIText>
							) : null}

							<View style={{ height: 6 }} />

							<BAIGroupTabs tabs={TABS} value={tileMode} onChange={setTileMode} disabled={isUiDisabled} />

							<View style={{ height: 10 }} />

							{tileMode === "IMAGE" ? (
								<View style={styles.actions}>
									<View style={styles.inlineActions}>
										<BAIIconButton
											icon={imageActionIcon}
											accessibilityLabel={imageActionLabel}
											variant='filled'
											size='lg'
											iconColor={imageActionIconColor}
											onPress={isUndoState ? onRestoreImage : onRemoveImage}
											disabled={imageActionDisabled}
											style={[styles.photoActionIconButton, { backgroundColor: imageActionBackgroundColor }]}
										/>
										<BAIButton
											intent='primary'
											variant='solid'
											widthPreset='standard'
											iconLeft='image-multiple'
											onPress={onChooseFromLibrary}
											disabled={isUiDisabled}
											style={{ flex: 1 }}
											contentStyle={{ gap: 0 }}
										>
											Library
										</BAIButton>
										<BAIButton
											intent='primary'
											variant='solid'
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
									<View style={styles.previewContainer}>
										<View
											style={[
												styles.previewWrap,
												{
													borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
													backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
												},
											]}
										>
											{hasImage ? (
												<Image source={{ uri: tileImageUri }} style={styles.previewImage} resizeMode='cover' />
											) : (
												<View style={styles.previewEmpty}>
													<FontAwesome6
														name='image'
														size={52}
														color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
													/>
													<BAIText variant='caption' muted>
														No Photo
													</BAIText>
												</View>
											)}
										</View>
									</View>
								</View>
							) : (
								<PosTileColorSelector value={tileColor} onChange={setTileColor} disabled={isUiDisabled} />
							)}
						</BAISurface>

						<View style={styles.footerActions}>
							<BAIButton
								intent='neutral'
								variant='outline'
								widthPreset='standard'
								onPress={guardedOnExit}
								disabled={isUiDisabled}
								style={{ flex: 1 }}
							>
								Cancel
							</BAIButton>

							<BAIButton
								intent='primary'
								variant='solid'
								widthPreset='standard'
								onPress={onSave}
								disabled={isUiDisabled || !isTileLabelValid || !hasChanges}
								style={{ flex: 1 }}
							>
								Save
							</BAIButton>
						</View>
					</View>
				</TouchableWithoutFeedback>
			</BAIScreen>
			<InventoryPermissionModal
				visible={cameraModalOpen}
				title='Select Photo'
				message={cameraModalMessage}
				borderColor={theme.colors.outlineVariant ?? theme.colors.outline}
				onClose={onCloseCameraModal}
				allowSettings={cameraModalAllowSettings}
				onOpenSettings={cameraModalAllowSettings ? onOpenSettings : undefined}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	screen: { flex: 1, paddingHorizontal: 8, gap: 12 },
	card: { borderWidth: 1, borderRadius: 24, padding: 12 },
	actions: { gap: 8, marginBottom: 12 },
	inlineActions: {
		flexDirection: "row",
		gap: 12,
		alignItems: "center",
	},
	footerActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	photoActionIconButton: {
		width: 52,
		height: 52,
		borderRadius: 26,
	},
	previewContainer: {
		alignItems: "center",
		marginTop: 8,
	},
	previewWrap: {
		borderWidth: 1,
		borderRadius: 18,
		overflow: "hidden",
		width: "62%",
		aspectRatio: 1,
		alignSelf: "center",
	},
	previewEmpty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	previewImage: {
		width: "100%",
		height: "100%",
	},
});
