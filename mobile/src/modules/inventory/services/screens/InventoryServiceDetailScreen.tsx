// BizAssist_mobile
// path: src/modules/inventory/services/screens/InventoryServiceDetailScreen.tsx

import { FontAwesome6 } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";

import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { BAITimeAgo } from "@/components/system/BAITimeAgo";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAICTAPillButton } from "@/components/ui/BAICTAButton";
import { BAIConfirmArchiveModal, BAIConfirmRestoreModal } from "@/components/ui/BAIConfirmEntityActionModal";
import { BAIIconButton } from "@/components/ui/BAIIconButton";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";

import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { DEFAULT_SERVICE_TOTAL_DURATION_MINUTES } from "@/modules/inventory/drafts/serviceCreateDraft";
import { PosTileTextOverlay } from "@/modules/inventory/components/PosTileTextOverlay";
import { inventoryApi } from "@/modules/inventory/inventory.api";
import { invalidateInventoryAfterMutation } from "@/modules/inventory/inventory.invalidate";
import { LOCAL_URI_KEY } from "@/modules/inventory/posTile.contract";
import { mapInventoryRouteToScope, type InventoryRouteScope } from "@/modules/inventory/navigation.scope";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import type { InventoryProductDetail } from "@/modules/inventory/inventory.types";
import { formatDurationLabel } from "@/modules/inventory/services/serviceDuration";
import { toCacheBustedImageUri } from "@/modules/media/media.image";
import { useNavLock } from "@/shared/hooks/useNavLock";
import { useOperationalQueryAutoRefresh } from "@/shared/hooks/useOperationalQueryAutoRefresh";
import { formatMoney } from "@/shared/money/money.format";
import { sanitizeLabelInput, sanitizeProductNameInput } from "@/shared/validation/sanitize";
import { useAppBusy } from "@/hooks/useAppBusy";
import { useAppToast } from "@/providers/AppToastProvider";

function isMeaningfulDetailText(v: unknown): v is string {
	if (typeof v !== "string") return false;
	const trimmed = v.trim();
	if (!trimmed) return false;
	return trimmed !== "-" && trimmed !== "—" && trimmed !== "–";
}

function formatReadableTime(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const date = new Date(trimmed);
	if (!Number.isFinite(date.getTime())) return trimmed;
	const datePart = date.toLocaleDateString();
	const timePart = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	return `${datePart}, ${timePart}`;
}

function formatUnitLabel(_p: any): string {
	return "Time";
}

function extractApiErrorMessage(err: unknown): string {
	const data = (err as any)?.response?.data;
	const msg = data?.message ?? data?.error?.message ?? (err as any)?.message ?? "Operation failed. Please try again.";
	return String(msg);
}

function normalizeNonNegativeMinutes(value: unknown): number | null {
	const raw = Number(value);
	if (!Number.isFinite(raw)) return null;
	const n = Math.trunc(raw);
	return n >= 0 ? n : null;
}

function normalizePositiveMinutes(value: unknown): number | null {
	const n = normalizeNonNegativeMinutes(value);
	if (n == null || n <= 0) return null;
	return n;
}

function DetailRow({ label, value, isLast = false }: { label: string; value: React.ReactNode; isLast?: boolean }) {
	const theme = useTheme();
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const labelColor = theme.colors.onSurfaceVariant ?? theme.colors.onSurface;
	const valueColor = theme.colors.onSurface;

	return (
		<View
			style={[
				styles.detailRow,
				!isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
			]}
		>
			<BAIText variant='caption' style={[styles.detailLabel, { color: labelColor }]}>
				{label}
			</BAIText>

			{typeof value === "string" ? (
				<BAIText variant='body' numberOfLines={2} style={[styles.detailValue, { color: valueColor }]}>
					{value}
				</BAIText>
			) : (
				<View style={styles.detailValueRow}>{value}</View>
			)}
		</View>
	);
}

export default function InventoryServiceDetailScreen({
	routeScope = "inventory",
}: {
	routeScope?: InventoryRouteScope;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const theme = useTheme();
	const tabBarHeight = useBottomTabBarHeight();
	const { canNavigate, safePush } = useNavLock({ lockMs: 650 });
	const { busy, withBusy } = useAppBusy();
	const { showError, showSuccess } = useAppToast();
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const { currencyCode } = useActiveBusinessMeta();
	const operationalRefreshInterval = useOperationalQueryAutoRefresh();

	const params = useLocalSearchParams<{ id: string; localUri?: string }>();
	const productId = useMemo(() => String(params.id ?? "").trim(), [params.id]);
	const incomingLocalImageUri = useMemo(() => String(params[LOCAL_URI_KEY] ?? "").trim(), [params]);
	const [optimisticImageUri, setOptimisticImageUri] = useState("");
	const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
	const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);

	const detailQuery = useQuery<InventoryProductDetail>({
		queryKey: inventoryKeys.productDetail(productId),
		queryFn: () => inventoryApi.getProductDetail(productId),
		enabled: !!productId,
		staleTime: 30_000,
		refetchInterval: productId ? operationalRefreshInterval : false,
		refetchIntervalInBackground: false,
	});

	const product = detailQuery.data ?? null;
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const secondaryTextColor = theme.colors.onSurfaceVariant ?? theme.colors.onSurface;
	const imageActionOverlayButtonStyle = useMemo(
		() => ({
			backgroundColor: theme.dark ? "rgba(17, 17, 17, 0.58)" : "rgba(255, 255, 255, 0.74)",
			borderColor: theme.dark ? borderColor : "rgba(0, 0, 0, 0.2)",
		}),
		[borderColor, theme.dark],
	);
	const isArchived = product?.isActive === false;

	const onBackToServices = useCallback(() => {
		if (!canNavigate) return;
		if (router.canGoBack?.()) {
			router.back();
			return;
		}
		router.replace({
			pathname: toScopedRoute("/(app)/(tabs)/inventory") as any,
			params: { type: "SERVICES" } as any,
		});
	}, [canNavigate, router, toScopedRoute]);

	const title = (product as any)?.name?.trim() ? (product as any).name : "Service";
	const typeLabel = "Service";

	const categoryName = useMemo(() => {
		const c = (product as any)?.category;
		const rawName = typeof c?.name === "string" ? c.name.trim() : "";
		return rawName || "None";
	}, [product]);

	const categoryColor = useMemo(() => {
		const c = (product as any)?.category;
		const raw = typeof c?.color === "string" ? c.color.trim() : "";
		if (!/^#[0-9A-Fa-f]{6}$/.test(raw)) return "";
		return raw;
	}, [product]);

	const categoryDotStyle = useMemo(() => {
		const fill = categoryColor ? categoryColor : "transparent";
		const stroke = categoryColor ? categoryColor : borderColor;
		return { backgroundColor: fill, borderColor: stroke };
	}, [borderColor, categoryColor]);

	const durationBreakdown = useMemo(() => {
		const total = normalizePositiveMinutes((product as any)?.durationTotalMinutes);
		const initial = normalizePositiveMinutes((product as any)?.durationInitialMinutes);
		const processing = normalizePositiveMinutes((product as any)?.durationProcessingMinutes);
		const final = normalizePositiveMinutes((product as any)?.durationFinalMinutes);
		const processingEnabled = Boolean((product as any)?.processingEnabled);

		const computedTotalFromSegments =
			initial != null && processing != null && final != null ? initial + processing + final : null;
		const effectiveTotal = processingEnabled
			? (computedTotalFromSegments ?? total ?? DEFAULT_SERVICE_TOTAL_DURATION_MINUTES)
			: (total ?? DEFAULT_SERVICE_TOTAL_DURATION_MINUTES);
		const durationValue = formatDurationLabel(effectiveTotal);

		return {
			durationValue,
			initial,
			processing,
			final,
			processingEnabled,
		};
	}, [product]);

	const priceText = useMemo(() => {
		const value = (product as any)?.price;
		if (value == null) return "—";
		return formatMoney({ amount: value, currencyCode });
	}, [currencyCode, product]);

	const imageUri = useMemo(
		() => optimisticImageUri || toCacheBustedImageUri((product as any)?.primaryImageUrl, (product as any)?.updatedAt),
		[optimisticImageUri, product],
	);

	useEffect(() => {
		if (!incomingLocalImageUri) return;
		setOptimisticImageUri(incomingLocalImageUri);
		(router as any).setParams?.({ [LOCAL_URI_KEY]: undefined });
	}, [incomingLocalImageUri, router]);

	const tileColor = useMemo(() => {
		const raw = typeof (product as any)?.posTileColor === "string" ? (product as any).posTileColor.trim() : "";
		return raw;
	}, [product]);

	const hasImage = Boolean(imageUri);
	const hasColor = Boolean(tileColor);
	const hasVisualTile = hasImage || hasColor;
	const shouldShowEmpty = !hasVisualTile;

	const tileLabel = useMemo(() => {
		const raw =
			typeof (product as any)?.posTileLabel === "string"
				? (product as any).posTileLabel
				: typeof (product as any)?.tileLabel === "string"
					? (product as any).tileLabel
					: typeof (product as any)?.posTileName === "string"
						? (product as any).posTileName
						: "";
		return sanitizeLabelInput(raw).trim();
	}, [product]);

	const tileServiceName = useMemo(() => {
		const raw = typeof (product as any)?.name === "string" ? (product as any).name : "";
		return sanitizeProductNameInput(raw).trim();
	}, [product]);

	const hasTileLabel = tileLabel.length > 0;
	const hasTileServiceName = tileServiceName.length > 0;
	const shouldShowTileTextOverlay = hasVisualTile && (hasTileLabel || hasTileServiceName);
	const tileLabelColor = "#FFFFFF";

	const [imageLoadFailed, setImageLoadFailed] = useState(false);

	useEffect(() => {
		setImageLoadFailed(false);
	}, [imageUri]);

	const onEditService = useCallback(() => {
		if (!productId) return;
		safePush(router, toScopedRoute(`/(app)/(tabs)/inventory/services/${encodeURIComponent(productId)}/edit`));
	}, [productId, router, safePush, toScopedRoute]);

	const onImagePress = useCallback(() => {
		if (!productId) return;
		safePush(router, toScopedRoute(`/(app)/(tabs)/inventory/services/${encodeURIComponent(productId)}/photo`));
	}, [productId, router, safePush, toScopedRoute]);

	const onArchiveService = useCallback(() => {
		if (!productId || !product || product.isActive === false || busy.isBusy) return;
		setIsArchiveConfirmOpen(true);
	}, [busy.isBusy, product, productId]);

	const onRestoreService = useCallback(() => {
		if (!productId || !product || product.isActive !== false || busy.isBusy) return;
		setIsRestoreConfirmOpen(true);
	}, [busy.isBusy, product, productId]);

	const closeArchiveConfirm = useCallback(() => {
		if (busy.isBusy) return;
		setIsArchiveConfirmOpen(false);
	}, [busy.isBusy]);

	const closeRestoreConfirm = useCallback(() => {
		if (busy.isBusy) return;
		setIsRestoreConfirmOpen(false);
	}, [busy.isBusy]);

	const onConfirmArchive = useCallback(async () => {
		if (!product || product.isActive === false || busy.isBusy) return;
		await withBusy("Archiving service...", async () => {
			try {
				await inventoryApi.archiveProduct(product.id);
				invalidateInventoryAfterMutation(queryClient, { productId });
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
					queryClient.invalidateQueries({ queryKey: ["pos", "catalog", "products"] }),
				]);
				setIsArchiveConfirmOpen(false);
				showSuccess("Service archived.");
			} catch (error) {
				showError(extractApiErrorMessage(error));
			}
		});
	}, [busy.isBusy, product, productId, queryClient, showError, showSuccess, withBusy]);

	const onConfirmRestore = useCallback(async () => {
		if (!product || product.isActive !== false || busy.isBusy) return;
		await withBusy("Restoring service...", async () => {
			try {
				await inventoryApi.restoreProduct(product.id);
				invalidateInventoryAfterMutation(queryClient, { productId });
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
					queryClient.invalidateQueries({ queryKey: ["pos", "catalog", "products"] }),
				]);
				setIsRestoreConfirmOpen(false);
				showSuccess("Service restored.");
			} catch (error) {
				showError(extractApiErrorMessage(error));
			}
		});
	}, [busy.isBusy, product, productId, queryClient, showError, showSuccess, withBusy]);

	const heroMetaLine = useMemo(() => {
		const tokens = [durationBreakdown.durationValue, priceText].filter(isMeaningfulDetailText);
		return tokens.join(" • ");
	}, [durationBreakdown.durationValue, priceText]);

	const heroSummaryCards = useMemo(
		() => [
			{ label: "Type", value: typeLabel },
			{ label: "Duration", value: durationBreakdown.durationValue },
			{ label: "Price", value: priceText },
			{ label: "Processing", value: durationBreakdown.processingEnabled ? "Enabled" : "Disabled" },
		],
		[durationBreakdown.durationValue, durationBreakdown.processingEnabled, priceText, typeLabel],
	);

	const details = useMemo(() => {
		if (!product) return [];
		const p: any = product;
		const rows: { label: string; value: React.ReactNode }[] = [];

		if (isMeaningfulDetailText(p.name)) rows.push({ label: "Name", value: p.name.trim() });
		if (typeof p.isActive === "boolean") rows.push({ label: "Status", value: p.isActive ? "Active" : "Archived" });
		if (categoryName !== "None") {
			rows.push({
				label: "Category",
				value: (
					<View style={styles.metaInline}>
						<View style={[styles.categoryDot, categoryDotStyle]} />
						<BAIText variant='body' numberOfLines={1} ellipsizeMode='tail' style={styles.detailValue}>
							{categoryName}
						</BAIText>
					</View>
				),
			});
		}
		if (isMeaningfulDetailText(p.description)) rows.push({ label: "Description", value: p.description.trim() });

		const unitLabel = formatUnitLabel(p);
		if (unitLabel && isMeaningfulDetailText(unitLabel)) rows.push({ label: "Unit Type", value: unitLabel });

		rows.push({ label: "Duration Time", value: durationBreakdown.durationValue });
		rows.push({ label: "Processing Time", value: durationBreakdown.processingEnabled ? "Enabled" : "Disabled" });
		rows.push({
			label: "Initial Duration Time",
			value:
				durationBreakdown.processingEnabled && durationBreakdown.initial != null
					? formatDurationLabel(durationBreakdown.initial)
					: "Disabled",
		});
		rows.push({
			label: "Processing Duration Time",
			value:
				durationBreakdown.processingEnabled && durationBreakdown.processing != null
					? formatDurationLabel(durationBreakdown.processing)
					: "Disabled",
		});
		rows.push({
			label: "Final Duration Time",
			value:
				durationBreakdown.processingEnabled && durationBreakdown.final != null
					? formatDurationLabel(durationBreakdown.final)
					: "Disabled",
		});

		const createdAtLabel = formatReadableTime(p.createdAt);
		if (createdAtLabel && isMeaningfulDetailText(createdAtLabel)) {
			rows.push({
				label: "Created",
				value: (
					<View style={styles.timestampRow}>
						<BAIText variant='body' numberOfLines={1} style={[styles.detailValue, styles.timestampValue]}>
							{createdAtLabel}
						</BAIText>
						<BAIText variant='body' muted style={styles.inlineSep}>
							|
						</BAIText>
						<View style={styles.timestampAgo}>
							<BAITimeAgo value={p.createdAt} variant='body' muted />
						</View>
					</View>
				),
			});
		}

		const updatedAtLabel = formatReadableTime(p.updatedAt);
		if (updatedAtLabel && isMeaningfulDetailText(updatedAtLabel)) {
			rows.push({
				label: "Last Updated",
				value: (
					<View style={styles.timestampRow}>
						<BAIText variant='body' numberOfLines={1} style={[styles.detailValue, styles.timestampValue]}>
							{updatedAtLabel}
						</BAIText>
						<BAIText variant='body' muted style={styles.inlineSep}>
							|
						</BAIText>
						<View style={styles.timestampAgo}>
							<BAITimeAgo value={p.updatedAt} variant='body' muted />
						</View>
					</View>
				),
			});
		}

		return rows;
	}, [categoryDotStyle, categoryName, durationBreakdown, product]);

	const isLoading = detailQuery.isLoading;
	const isError = detailQuery.isError;
	const errorMessage = isError
		? String(
				(detailQuery.error as any)?.response?.data?.message ??
					(detailQuery.error as any)?.message ??
					"Failed to load service.",
			)
		: "";
	const showDetails = details.length > 0;

	return (
		<BAIScreen padded={false} tabbed safeTop={false} safeBottom={false} safeAreaGradientBottom style={styles.root}>
			<BAIHeader title='Service Details' variant='back' onLeftPress={onBackToServices} disabled={!canNavigate} />

			<ScrollView
				style={styles.screenScroll}
				contentContainerStyle={[styles.screenContent, { paddingBottom: tabBarHeight + 12 }]}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps='handled'
			>
				{isLoading ? (
					<View style={styles.contentColumn}>
						<BAISurface style={styles.stateSurface}>
							<View style={styles.center}>
								<BAIActivityIndicator />
							</View>
						</BAISurface>
					</View>
				) : isError || !product ? (
					<View style={styles.contentColumn}>
						<BAISurface style={styles.stateSurface}>
							<View style={styles.center}>
								<BAIText variant='title' numberOfLines={1} ellipsizeMode='tail' style={styles.title}>
									{title}
								</BAIText>

								<BAIText variant='body' muted style={styles.errorText}>
									{errorMessage || "Could not load service."}
								</BAIText>

								<View style={styles.actions}>
									<BAIRetryButton mode='contained' onPress={() => detailQuery.refetch()} disabled={!productId}>
										Retry
									</BAIRetryButton>
								</View>
							</View>
						</BAISurface>
					</View>
				) : (
					<View style={styles.contentColumn}>
						<BAISurface style={styles.heroSurface} padded={false} radius={28} elevation={1}>
							<View style={styles.heroSurfaceInner}>
								<View style={styles.heroMediaWrap}>
									<View
										style={[
											styles.imagePreview,
											{
												borderColor,
												backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
											},
										]}
									>
										{hasImage ? (
											<View style={styles.imageFill}>
												<Image
													source={{ uri: imageUri }}
													style={styles.imagePreviewImage}
													resizeMode='cover'
													onLoad={() => setImageLoadFailed(false)}
													onError={() => setImageLoadFailed(true)}
												/>

												{imageLoadFailed ? (
													<View style={styles.imageLoadingOverlay} pointerEvents='none'>
														<FontAwesome6
															name='image'
															size={48}
															color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
														/>
														<View style={styles.failedPhotoSpacer} />
														<BAIText variant='caption' muted>
															Failed to load photo
														</BAIText>
													</View>
												) : null}
											</View>
										) : hasColor ? (
											<View style={[styles.imagePreviewImage, { backgroundColor: tileColor }]} />
										) : shouldShowEmpty ? (
											<View style={styles.imagePreviewEmpty}>
												<FontAwesome6
													name='image'
													size={64}
													color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
												/>
												<BAIText variant='caption' muted>
													No Photo
												</BAIText>
											</View>
										) : null}

										{shouldShowTileTextOverlay ? (
											<PosTileTextOverlay label={tileLabel} name={tileServiceName} textColor={tileLabelColor} />
										) : null}

										{!isArchived ? (
											<View style={styles.imageActionOverlay}>
												<BAIIconButton
													variant='outlined'
													size='md'
													icon='camera'
													iconSize={30}
													accessibilityLabel='Edit image'
													onPress={onImagePress}
													disabled={!canNavigate || isLoading}
													style={[styles.imageActionButtonOverlay, imageActionOverlayButtonStyle]}
												/>
											</View>
										) : null}
									</View>
								</View>

								<View style={styles.heroCopyWrap}>
									<View style={styles.heroBadgeRow}>
										<View
											style={[
												styles.heroBadge,
												{
													borderColor,
													backgroundColor: isArchived
														? (theme.colors.errorContainer ?? theme.colors.surfaceVariant)
														: theme.colors.surface,
												},
											]}
										>
											<BAIText
												variant='caption'
												style={{
													color: isArchived ? (theme.colors.error ?? theme.colors.onSurface) : theme.colors.onSurface,
												}}
											>
												{isArchived ? "Archived" : "Active"}
											</BAIText>
										</View>

										{categoryName !== "None" ? (
											<View style={[styles.heroCategoryBadge, { borderColor }]}>
												<View style={[styles.categoryDot, categoryDotStyle]} />
												<BAIText variant='caption' numberOfLines={1} style={styles.heroCategoryText}>
													{categoryName}
												</BAIText>
											</View>
										) : null}
									</View>

									<BAIText variant='title' numberOfLines={2} ellipsizeMode='tail' style={styles.heroTitle}>
										{title}
									</BAIText>

									{heroMetaLine ? (
										<BAIText
											variant='body'
											numberOfLines={2}
											ellipsizeMode='tail'
											style={[styles.heroMetaLine, { color: secondaryTextColor }]}
										>
											{heroMetaLine}
										</BAIText>
									) : null}
								</View>

								<View style={styles.heroStatsGrid}>
									{heroSummaryCards.map((card) => (
										<View
											key={card.label}
											style={[
												styles.heroStatCard,
												{
													borderColor,
													backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
												},
											]}
										>
											<BAIText variant='caption' style={{ color: secondaryTextColor }}>
												{card.label}
											</BAIText>
											<BAIText variant='subtitle' numberOfLines={2} ellipsizeMode='tail' style={styles.heroStatValue}>
												{card.value}
											</BAIText>
										</View>
									))}
								</View>
							</View>
						</BAISurface>

						{!isArchived ? (
							<BAISurface style={styles.actionSurface} padded={false} radius={24} elevation={1}>
								<View style={styles.actionSurfaceInner}>
									<View style={styles.itemFooterActions}>
										<BAICTAPillButton
											variant='solid'
											intent='primary'
											onPress={onEditService}
											disabled={!productId || !canNavigate}
											style={styles.footerActionButton}
										>
											Edit Service
										</BAICTAPillButton>
									</View>
								</View>
							</BAISurface>
						) : null}

						{showDetails ? (
							<BAISurface style={styles.sectionSurface} padded={false} radius={24} elevation={1}>
								<View style={[styles.sectionHeader, { borderBottomColor: borderColor }]}>
									<View style={styles.sectionHeaderText}>
										<BAIText variant='subtitle'>Details</BAIText>
										<BAIText variant='caption' style={{ color: secondaryTextColor }}>
											Service profile and duration information
										</BAIText>
									</View>
								</View>
								<View style={styles.sectionBody}>
									<View style={styles.detailsGridTight}>
										{details.map((r, index) => (
											<DetailRow
												key={`${r.label}:${String(index)}`}
												label={r.label}
												value={r.value}
												isLast={index === details.length - 1}
											/>
										))}
									</View>
								</View>
							</BAISurface>
						) : null}

						<BAISurface style={styles.actionSurface} padded={false} radius={24} elevation={1}>
							<View style={styles.actionSurfaceInner}>
								<View style={styles.itemFooterActions}>
									{isArchived ? (
										<>
											<BAICTAPillButton
												variant='outline'
												intent='neutral'
												onPress={onBackToServices}
												disabled={!canNavigate}
												style={styles.footerActionButton}
											>
												Cancel
											</BAICTAPillButton>
											<BAICTAPillButton
												variant='solid'
												intent='primary'
												onPress={onRestoreService}
												disabled={!productId || !canNavigate}
												style={styles.footerActionButton}
											>
												Restore
											</BAICTAPillButton>
										</>
									) : (
										<>
											<BAICTAPillButton
												variant='outline'
												intent='danger'
												onPress={onArchiveService}
												disabled={!productId || !canNavigate}
												style={styles.footerActionButton}
											>
												Archive
											</BAICTAPillButton>
											<BAICTAPillButton
												variant='outline'
												intent='neutral'
												onPress={onBackToServices}
												disabled={!canNavigate}
												style={styles.footerActionButton}
											>
												Cancel
											</BAICTAPillButton>
										</>
									)}
								</View>
							</View>
						</BAISurface>
					</View>
				)}
			</ScrollView>
			<BAIConfirmArchiveModal
				visible={isArchiveConfirmOpen}
				entityLabel='service'
				entityName={product?.name}
				description='Archived services stay in historical records and are removed from active lists and POS.'
				onDismiss={closeArchiveConfirm}
				onConfirm={onConfirmArchive}
				disabled={busy.isBusy}
			/>
			<BAIConfirmRestoreModal
				visible={isRestoreConfirmOpen}
				entityLabel='service'
				entityName={product?.name}
				description='Restored services return to active lists and can be sold in POS again.'
				onDismiss={closeRestoreConfirm}
				onConfirm={onConfirmRestore}
				disabled={busy.isBusy}
			/>
		</BAIScreen>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	screenScroll: { flex: 1 },
	screenContent: { paddingHorizontal: 14, paddingTop: 0, alignItems: "center" },
	contentColumn: { width: "100%", maxWidth: 920 },
	center: { padding: 24, alignItems: "center", justifyContent: "center", minHeight: 180 },
	stateSurface: { marginBottom: 0 },

	heroSurface: {
		marginBottom: 14,
	},
	heroSurfaceInner: {
		padding: 16,
		gap: 16,
	},
	heroMediaWrap: {
		alignSelf: "center",
		width: 240,
	},
	heroCopyWrap: {
		width: "100%",
		gap: 10,
		paddingTop: 2,
		alignItems: "flex-start",
	},
	heroBadgeRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
	},
	heroBadge: {
		paddingHorizontal: 12,
		paddingVertical: 7,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
	},
	heroCategoryBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		maxWidth: "100%",
		paddingHorizontal: 12,
		paddingVertical: 7,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
	},
	heroCategoryText: {
		flexShrink: 1,
	},
	heroTitle: {
		fontWeight: "700",
	},
	heroMetaLine: {
		lineHeight: 20,
	},
	heroStatsGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
	},
	heroStatCard: {
		width: "48.5%",
		minHeight: 86,
		borderRadius: 18,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 14,
		paddingVertical: 12,
		justifyContent: "space-between",
	},
	heroStatValue: {
		fontWeight: "700",
	},

	itemFooterActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	actionSurface: {
		marginBottom: 14,
	},
	actionSurfaceInner: {
		padding: 14,
		gap: 10,
	},
	footerActionButton: {
		flex: 1,
	},
	imagePreview: {
		width: "100%",
		aspectRatio: 1,
		borderRadius: 24,
		borderWidth: 1,
		overflow: "hidden",
		position: "relative",
	},
	imageFill: {
		width: "100%",
		height: "100%",
	},
	imagePreviewImage: {
		width: "100%",
		height: "100%",
	},
	imageLoadingOverlay: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	imageActionOverlay: {
		position: "absolute",
		bottom: 12,
		right: 12,
		alignItems: "flex-end",
		zIndex: 2,
	},
	imageActionButtonOverlay: {
		width: 46,
		height: 46,
		borderRadius: 23,
	},
	imagePreviewEmpty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},

	metaInline: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
	categoryDot: { width: 12, height: 12, borderRadius: 9, borderWidth: 1 },
	title: { flexShrink: 1 },
	errorText: { marginTop: 8, textAlign: "center" },
	actions: { marginTop: 12, flexDirection: "row", gap: 10 },

	sectionSurface: {
		marginBottom: 14,
	},
	sectionHeader: {
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	sectionHeaderText: {
		gap: 4,
	},
	sectionBody: { padding: 16 },
	detailsGridTight: { gap: 0 },

	detailRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
	detailLabel: { textTransform: "none", letterSpacing: 0, minWidth: 110, maxWidth: 130, flexShrink: 0 },
	detailValue: { flex: 1, lineHeight: 18 },
	detailValueRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, flex: 1 },

	inlineSep: { marginHorizontal: 4 },
	timestampRow: { flexDirection: "row", alignItems: "center", flexWrap: "nowrap", gap: 4, flex: 1 },
	timestampValue: { flex: 0, flexShrink: 1 },
	timestampAgo: { flexShrink: 0 },
	failedPhotoSpacer: { height: 6 },
});
