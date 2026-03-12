// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/products/[id]/photo.tsx
//
// Item Photo Pipeline (Product Image Pipeline) - v1
// Governance:
// - This is a DETAIL screen (drill-down from Product Details).
// - Back navigates history.
// - Mutations use global Busy overlay + nav-lock.
// - Media module owns signed upload + commit. Inventory only consumes.
//

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { FontAwesome6 } from "@expo/vector-icons";

import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAICTAPillButton } from "@/components/ui/BAICTAButton";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { ConfirmActionModal } from "@/components/settings/ConfirmActionModal";

import { useAppBusy } from "@/hooks/useAppBusy";
import { useInventoryHeader } from "@/modules/inventory/useInventoryHeader";
import { runGovernedBack } from "@/modules/inventory/navigation.governance";
import { requestCameraAccess } from "@/modules/inventory/inventory.permissions";
import { patchProductImageCaches } from "@/modules/inventory/inventory.cache";
import {
	inventoryScopeRoot,
	mapInventoryRouteToScope,
	type InventoryRouteScope,
} from "@/modules/inventory/navigation.scope";

import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import { inventoryApi } from "@/modules/inventory/inventory.api";
import { toCacheBustedImageUri } from "@/modules/media/media.image";
import { toMediaDomainError } from "@/modules/media/media.errors";
import { catalogKeys } from "@/modules/catalog/catalog.queries";
import { patchPosCatalogImageCaches } from "@/modules/pos/pos.catalog.cache";
import {
	LOCAL_URI_KEY,
	POS_TILE_CROP_ROUTE,
	RETURN_TO_KEY,
	ROOT_RETURN_TO_KEY,
} from "@/modules/inventory/posTile.contract";

const INVENTORY_ITEM_DETAILS_ROUTE = "/(app)/(tabs)/inventory/products/[id]" as const;

export default function ProductPhotoScreen({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const theme = useTheme();
	const qc = useQueryClient();
	const { withBusy } = useAppBusy();
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const rootRoute = useMemo(() => inventoryScopeRoot(routeScope), [routeScope]);

	const params = useLocalSearchParams<{ id?: string; localUri?: string }>();
	const productId = String(params.id ?? "");
	const incomingLocalImageUri = useMemo(() => String(params[LOCAL_URI_KEY] ?? "").trim(), [params]);
	const detailRoute = useMemo(
		() => (productId ? toScopedRoute(`/(app)/(tabs)/inventory/products/${encodeURIComponent(productId)}`) : rootRoute),
		[productId, rootRoute, toScopedRoute],
	);

	// --- Navigation lock (mandatory)
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

	const productQuery = useQuery({
		queryKey: inventoryKeys.productDetail(productId),
		queryFn: () => inventoryApi.getProductDetail(productId),
		enabled: Boolean(productId),
	});

	const product = productQuery.data;
	const [optimisticImageUri, setOptimisticImageUri] = useState("");

	useEffect(() => {
		if (!incomingLocalImageUri) return;
		setOptimisticImageUri(incomingLocalImageUri);
		(router as any).setParams?.({ [LOCAL_URI_KEY]: undefined });
	}, [incomingLocalImageUri, router]);

	const remoteImageUri = useMemo(
		() => toCacheBustedImageUri(product?.primaryImageUrl, (product as any)?.updatedAt),
		[product],
	);
	const imageUri = optimisticImageUri || remoteImageUri;
	const hasImage = imageUri.length > 0;

	const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const isUiDisabled = isNavLocked || productQuery.isLoading;
	const onBack = useCallback(() => {
		runGovernedBack(
			{
				router: router as any,
				lockNav,
				disabled: isUiDisabled,
			},
			detailRoute,
		);
	}, [detailRoute, isUiDisabled, lockNav, router]);

	const headerOptions = useInventoryHeader("detail", {
		title: "Photo",
		disabled: isUiDisabled,
		onBack,
	});

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;

	const pickFromLibrary = useCallback(async () => {
		if (!lockNav()) return;
		setErrorMessage(null);

		router.replace({
			pathname: toScopedRoute("/(app)/(tabs)/inventory/products/pos-tile-photo-library.phone") as any,
			params: {
				mode: "itemPhoto",
				productId,
				[RETURN_TO_KEY]: toScopedRoute("/(app)/(tabs)/inventory/products/[id]/photo"),
				[ROOT_RETURN_TO_KEY]: toScopedRoute(INVENTORY_ITEM_DETAILS_ROUTE),
			},
		});
	}, [lockNav, productId, router, toScopedRoute]);

	const takePhoto = useCallback(async () => {
		if (!lockNav()) return;
		setErrorMessage(null);
		try {
			const permissionState = await requestCameraAccess();
			if (permissionState !== "granted") {
				if (permissionState === "blocked") {
					setErrorMessage("Camera access is blocked. Open Settings to allow camera access, or use Photo Library.");
					return;
				}

				setErrorMessage("Camera permission is required. Use Photo Library if you prefer.");
				return;
			}

			const res = await ImagePicker.launchCameraAsync({
				mediaTypes: ["images"] as any,
				allowsEditing: false, // crop is handled in our PROCESS screen
				quality: 1,
			});

			if (res.canceled) return;

			const asset = res.assets?.[0];
			if (!asset?.uri) return;

			router.replace({
				pathname: toScopedRoute(POS_TILE_CROP_ROUTE) as any,
				params: {
					mode: "itemPhoto",
					productId,
					[LOCAL_URI_KEY]: asset.uri,
					[RETURN_TO_KEY]: toScopedRoute("/(app)/(tabs)/inventory/products/[id]/photo"),
					[ROOT_RETURN_TO_KEY]: toScopedRoute(INVENTORY_ITEM_DETAILS_ROUTE),
				},
			});
		} catch {
			setErrorMessage("Camera is not available on this device. Use Photo Library instead.");
		}
	}, [lockNav, productId, router, toScopedRoute]);

	const removePhoto = useCallback(async () => {
		setConfirmRemoveOpen(false);
		if (!lockNav()) return;
		setErrorMessage(null);

		await withBusy("Removing photo…", async () => {
			try {
				await inventoryApi.removeProductImage(productId);
				const nextUpdatedAt = new Date().toISOString();
				setOptimisticImageUri("");
				patchProductImageCaches(qc, productId, {
					primaryImageUrl: "",
					updatedAt: nextUpdatedAt,
				});
				patchPosCatalogImageCaches(qc, {
					productId,
					primaryImageUrl: "",
					updatedAt: nextUpdatedAt,
				});

				await Promise.all([
					qc.invalidateQueries({ queryKey: inventoryKeys.productDetail(productId) }),
					qc.invalidateQueries({ queryKey: inventoryKeys.productsRoot() }),
					qc.invalidateQueries({ queryKey: inventoryKeys.productsInfiniteRoot() }),
					qc.invalidateQueries({ queryKey: ["pos", "catalog", "products"] }),
					qc.invalidateQueries({ queryKey: catalogKeys.all }),
				]);
			} catch (e) {
				const domain = toMediaDomainError(e);
				const mapped = domain.message;
				setErrorMessage(
					mapped === "Upload failed. Please try again." ? "Unable to remove photo. Please try again." : mapped,
				);
			}
		});
	}, [lockNav, productId, qc, withBusy]);

	const onCancel = useCallback(() => {
		if (isUiDisabled) return;
		onBack();
	}, [isUiDisabled, onBack]);

	const onConfirmRemove = useCallback(() => {
		void removePhoto();
	}, [removePhoto]);

	const previewNode = useMemo(() => {
		if (hasImage) {
			return <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode='cover' />;
		}
		return (
			<View style={styles.previewEmpty}>
				<FontAwesome6
					name='image'
					size={100}
					color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
					style={styles.previewEmptyIcon}
				/>
				<BAIText variant='body' muted>
					No Photo
				</BAIText>
			</View>
		);
	}, [hasImage, imageUri, theme.colors.onSurface, theme.colors.onSurfaceVariant]);

	if (productQuery.isError) {
		return (
			<>
				<Stack.Screen options={headerOptions} />
				<BAIScreen padded={false} tabbed safeTop={false} style={styles.root}>
					<BAISurface style={[styles.surface, { borderColor }]} padded>
						<BAIText variant='title'>Photo</BAIText>
						<BAIText variant='body' muted style={styles.muted}>
							Couldn’t load item details.
						</BAIText>
						<BAIRetryButton onPress={() => productQuery.refetch()} />
					</BAISurface>
				</BAIScreen>
			</>
		);
	}

	return (
		<>
			<Stack.Screen options={headerOptions} />

			<BAIScreen padded={false} tabbed safeTop={false} style={styles.root}>
				<BAISurface style={[styles.surface, { borderColor }]} padded>
					<BAIText variant='title' style={styles.title}>
						Item Photo
					</BAIText>
					<BAIText variant='body' muted style={styles.muted}>
						Add or replace the primary photo for this item.
					</BAIText>
					{errorMessage ? (
						<BAIText variant='caption' style={[styles.errorText, { color: theme.colors.error }]}>
							{errorMessage}
						</BAIText>
					) : null}

					<View
						style={[
							styles.preview,
							{
								borderColor,
								backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
							},
						]}
					>
						{previewNode}
					</View>

					<View style={styles.actions}>
						<View style={styles.primaryActions}>
							<BAICTAPillButton
								intent='primary'
								variant='outline'
								onPress={pickFromLibrary}
								disabled={isUiDisabled}
								style={styles.actionButton}
							>
								Photo Library
							</BAICTAPillButton>
							<BAICTAPillButton
								intent='primary'
								variant='solid'
								onPress={takePhoto}
								disabled={isUiDisabled}
								style={styles.actionButton}
							>
								Take a Photo
							</BAICTAPillButton>
						</View>

						<View style={styles.secondaryActions}>
							<BAICTAPillButton
								intent='neutral'
								variant='outline'
								onPress={onCancel}
								disabled={isUiDisabled}
								style={styles.secondaryButton}
							>
								Cancel
							</BAICTAPillButton>
							<BAICTAPillButton
								intent='danger'
								variant='outline'
								onPress={() => setConfirmRemoveOpen(true)}
								disabled={isUiDisabled || !hasImage}
								style={styles.secondaryButton}
							>
								Remove Photo
							</BAICTAPillButton>
						</View>
					</View>
				</BAISurface>
			</BAIScreen>

			<ConfirmActionModal
				visible={confirmRemoveOpen}
				title='Remove Photo?'
				message='This will remove the primary photo from the item.'
				confirmLabel='Remove'
				cancelLabel='Cancel'
				confirmIntent='danger'
				onDismiss={() => setConfirmRemoveOpen(false)}
				onConfirm={onConfirmRemove}
				disabled={isUiDisabled}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	surface: {
		margin: 16,
		marginTop: 0,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 18,
	},
	title: { marginBottom: 6 },
	muted: { marginBottom: 12 },
	errorText: { marginBottom: 12 },
	preview: {
		width: "100%",
		aspectRatio: 1,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		overflow: "hidden",
		marginBottom: 16,
	},
	previewImage: { width: "100%", height: "100%" },
	previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
	previewEmptyIcon: { marginBottom: 6 },
	actions: { gap: 10 },
	primaryActions: { flexDirection: "row", gap: 10, marginTop: 10 },
	actionButton: { flex: 1 },
	secondaryActions: { marginTop: 6, flexDirection: "row", gap: 10 },
	secondaryButton: { flex: 1 },
});
