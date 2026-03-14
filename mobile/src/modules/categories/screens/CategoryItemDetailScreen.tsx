import { FontAwesome6 } from "@expo/vector-icons";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "react-native-paper";

import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { DEFAULT_SERVICE_TOTAL_DURATION_MINUTES } from "@/modules/inventory/drafts/serviceCreateDraft";
import { inventoryApi } from "@/modules/inventory/inventory.api";
import type { InventoryProductDetail } from "@/modules/inventory/inventory.types";
import { formatDurationLabel } from "@/modules/inventory/services/serviceDuration";
import { toCacheBustedImageUri } from "@/modules/media/media.image";
import { formatMoney } from "@/shared/money/money.format";

const DETAIL_MAX_WIDTH = 860;

function extractApiErrorMessage(err: unknown): string {
	const data = (err as any)?.response?.data;
	const msg = data?.message ?? data?.error?.message ?? (err as any)?.message ?? "Operation failed.";
	return String(msg);
}

function formatProductType(type: InventoryProductDetail["type"] | undefined): string {
	return type === "SERVICE" ? "Service" : "Item";
}

function hasMeaningfulText(value: unknown): boolean {
	return typeof value === "string" && value.trim().length > 0;
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

function formatUnitLabel(product: InventoryProductDetail): string | null {
	const abbreviation =
		typeof product.unitAbbreviation === "string" && product.unitAbbreviation.trim().length > 0
			? product.unitAbbreviation.trim()
			: "";
	const name =
		typeof product.unitName === "string" && product.unitName.trim().length > 0 ? product.unitName.trim() : "";
	if (name && abbreviation) return `${name} (${abbreviation})`;
	return name || abbreviation || null;
}

function formatPrecisionLabel(scale: unknown): string | null {
	if (!Number.isFinite(scale)) return null;
	const precision = Math.max(0, Math.trunc(Number(scale)));
	return precision === 0 ? "Whole units" : `${precision} decimal place${precision === 1 ? "" : "s"}`;
}

function formatOnHand(product: InventoryProductDetail): string {
	if (!product.trackInventory) return "Not tracked";
	const raw =
		typeof product.onHandCachedRaw === "string" && product.onHandCachedRaw.trim().length > 0
			? product.onHandCachedRaw.trim()
			: Number.isFinite(product.onHandCached)
				? String(product.onHandCached)
				: "0";
	const unitLabel =
		(typeof product.unitAbbreviation === "string" && product.unitAbbreviation.trim()) ||
		(typeof product.unitName === "string" && product.unitName.trim()) ||
		"";
	return unitLabel ? `${raw} ${unitLabel}` : raw;
}

function formatReorderPoint(product: InventoryProductDetail): string | null {
	const raw =
		typeof product.reorderPointRaw === "string" && product.reorderPointRaw.trim().length > 0
			? product.reorderPointRaw.trim()
			: product.reorderPoint !== null && product.reorderPoint !== undefined && Number.isFinite(product.reorderPoint)
				? String(product.reorderPoint)
				: "";
	if (!raw) return null;
	const unitLabel =
		(typeof product.unitAbbreviation === "string" && product.unitAbbreviation.trim()) ||
		(typeof product.unitName === "string" && product.unitName.trim()) ||
		"";
	return unitLabel ? `${raw} ${unitLabel}` : raw;
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

function withSummaryFallback(value: string | null | undefined): string {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized.length > 0 ? normalized : "—";
}

export function CategoryItemDetailScreen({ mode }: { mode: "inventory" | "settings" }) {
	const router = useRouter();
	const theme = useTheme();
	const { currencyCode } = useActiveBusinessMeta();

	const params = useLocalSearchParams<{ id?: string; itemId?: string }>();
	const categoryId = String(params.id ?? "").trim();
	const itemId = String(params.itemId ?? "").trim();

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

	const query = useQuery<InventoryProductDetail>({
		queryKey: ["inventory", "product-detail", "category-scope", itemId] as const,
		queryFn: () => inventoryApi.getProductDetail(itemId),
		enabled: itemId.length > 0,
		staleTime: 30_000,
	});

	const product = query.data ?? null;
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const secondaryTextColor = theme.dark
		? (theme.colors.onSurfaceVariant ?? theme.colors.onSurface)
		: theme.colors.onSurface;
	const categoryRouteBase =
		mode === "settings" ? "/(app)/(tabs)/settings/categories" : "/(app)/(tabs)/inventory/categories";
	const [imageLoadFailed, setImageLoadFailed] = useState(false);

	const categoryColor = useMemo(() => {
		if (!product) return "";
		const raw = typeof product.category?.color === "string" ? product.category.color.trim() : "";
		return /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw : "";
	}, [product]);

	const onBack = useCallback(() => {
		if (!lockNav()) return;
		if (router.canGoBack?.()) {
			router.back();
			return;
		}
		router.replace(`${categoryRouteBase}/${encodeURIComponent(categoryId)}` as any);
	}, [categoryId, categoryRouteBase, lockNav, router]);

	const onRetry = useCallback(() => {
		if (!itemId) return;
		query.refetch();
	}, [itemId, query]);

	const categoryName = useMemo(() => {
		if (!product) return "";
		return typeof product.category?.name === "string" && product.category.name.trim().length > 0
			? product.category.name.trim()
			: "";
	}, [product]);

	const barcodeValue = useMemo(() => {
		if (!product || !hasMeaningfulText(product.barcode)) return "";
		return String(product.barcode).trim();
	}, [product]);

	const skuValue = useMemo(() => {
		if (!product || !hasMeaningfulText(product.sku)) return "";
		return String(product.sku).trim();
	}, [product]);

	const priceValue = useMemo(() => {
		if (!product || product.price === null || product.price === undefined) return null;
		return formatMoney({ currencyCode, amount: product.price });
	}, [currencyCode, product]);

	const reorderPointValue = useMemo(() => {
		if (!product) return null;
		return formatReorderPoint(product);
	}, [product]);

	const isService = product?.type === "SERVICE";
	const screenTitle = isService ? "Service Details" : "Item Details";
	const detailsSubtitle = isService ? "Complete service profile" : "Complete item profile";

	const serviceTiming = useMemo(() => {
		if (!isService || !product) {
			return {
				durationValue: null,
				processingEnabled: false,
				initial: null as number | null,
				processing: null as number | null,
				final: null as number | null,
			};
		}

		const total = normalizePositiveMinutes(product.durationTotalMinutes);
		const initial = normalizePositiveMinutes(product.durationInitialMinutes);
		const processing = normalizePositiveMinutes(product.durationProcessingMinutes);
		const final = normalizePositiveMinutes(product.durationFinalMinutes);
		const processingEnabled = Boolean(product.processingEnabled);
		const computedTotalFromSegments =
			initial != null && processing != null && final != null ? initial + processing + final : null;
		const effectiveTotal = processingEnabled
			? (computedTotalFromSegments ?? total ?? DEFAULT_SERVICE_TOTAL_DURATION_MINUTES)
			: (total ?? DEFAULT_SERVICE_TOTAL_DURATION_MINUTES);

		return {
			durationValue: formatDurationLabel(effectiveTotal),
			processingEnabled,
			initial,
			processing,
			final,
		};
	}, [isService, product]);

	const summaryCards = useMemo(() => {
		if (!product) return [];

		if (isService) {
			return [
				{ label: "Type", value: withSummaryFallback(formatProductType(product.type)) },
				{ label: "Duration", value: withSummaryFallback(serviceTiming.durationValue) },
				{ label: "Price", value: withSummaryFallback(priceValue) },
				{ label: "Processing", value: serviceTiming.processingEnabled ? "Enabled" : "Disabled" },
			];
		}

		return [
			{ label: "Type", value: withSummaryFallback(formatProductType(product.type)) },
			{ label: "On Hand", value: withSummaryFallback(formatOnHand(product)) },
			{ label: "Price", value: withSummaryFallback(priceValue) },
			{ label: "Reorder", value: withSummaryFallback(reorderPointValue) },
		];
	}, [isService, priceValue, product, reorderPointValue, serviceTiming.durationValue, serviceTiming.processingEnabled]);

	const heroMetaText = useMemo(() => {
		const tokens = [skuValue ? `SKU ${skuValue}` : "", barcodeValue].filter((value) => value.length > 0);
		return tokens.join(" • ");
	}, [barcodeValue, skuValue]);

	const detailRows = useMemo(() => {
		if (!product) return [];

		if (isService) {
			const rows: { label: string; value: string | ReactNode }[] = [];

			const unitLabel = formatUnitLabel(product);
			if (unitLabel) {
				rows.push({ label: "Unit Type", value: unitLabel });
			}

			if (serviceTiming.durationValue) {
				rows.push({ label: "Duration", value: serviceTiming.durationValue });
			}

			rows.push({ label: "Processing", value: serviceTiming.processingEnabled ? "Enabled" : "Disabled" });

			if (serviceTiming.processingEnabled && serviceTiming.initial != null) {
				rows.push({ label: "Initial Duration", value: formatDurationLabel(serviceTiming.initial) });
			}

			if (serviceTiming.processingEnabled && serviceTiming.processing != null) {
				rows.push({ label: "Processing Duration", value: formatDurationLabel(serviceTiming.processing) });
			}

			if (serviceTiming.processingEnabled && serviceTiming.final != null) {
				rows.push({ label: "Final Duration", value: formatDurationLabel(serviceTiming.final) });
			}

			if (product.cost !== null && product.cost !== undefined) {
				rows.push({ label: "Cost", value: formatMoney({ currencyCode, amount: product.cost }) });
			}

			if (hasMeaningfulText(product.description)) {
				rows.push({ label: "Description", value: String(product.description).trim() });
			}

			const createdAt = formatReadableTime(product.createdAt);
			if (createdAt) {
				rows.push({ label: "Created", value: createdAt });
			}

			const updatedAt = formatReadableTime(product.updatedAt);
			if (updatedAt) {
				rows.push({ label: "Last Updated", value: updatedAt });
			}

			return rows;
		}

		const rows: { label: string; value: string | ReactNode }[] = [
			{ label: "Track Inventory", value: product.trackInventory ? "Yes" : "No" },
		];

		const unitLabel = formatUnitLabel(product);
		if (unitLabel) {
			rows.push({ label: "Unit", value: unitLabel });
		}

		const unitCategory =
			typeof product.unitCategory === "string" && product.unitCategory.trim().length > 0
				? product.unitCategory.trim()
				: "";
		if (unitCategory) {
			rows.push({ label: "Unit Category", value: unitCategory });
		}

		const precisionLabel = formatPrecisionLabel(product.unitPrecisionScale);
		if (precisionLabel) {
			rows.push({ label: "Precision", value: precisionLabel });
		}

		if (product.cost !== null && product.cost !== undefined) {
			rows.push({ label: "Cost", value: formatMoney({ currencyCode, amount: product.cost }) });
		}

		if (Array.isArray(product.variations) && product.variations.length > 0) {
			rows.push({ label: "Variations", value: `${product.variations.length} configured` });
		}

		if (Array.isArray(product.optionSelections) && product.optionSelections.length > 0) {
			rows.push({ label: "Option Sets", value: `${product.optionSelections.length} selected` });
		}

		if (Array.isArray(product.modifierGroupIds) && product.modifierGroupIds.length > 0) {
			rows.push({ label: "Modifier Sets", value: `${product.modifierGroupIds.length} linked` });
		}

		if (hasMeaningfulText(product.description)) {
			rows.push({ label: "Description", value: String(product.description).trim() });
		}

		const createdAt = formatReadableTime(product.createdAt);
		if (createdAt) {
			rows.push({ label: "Created", value: createdAt });
		}

		const updatedAt = formatReadableTime(product.updatedAt);
		if (updatedAt) {
			rows.push({ label: "Last Updated", value: updatedAt });
		}

		return rows;
	}, [
		currencyCode,
		isService,
		product,
		serviceTiming.durationValue,
		serviceTiming.final,
		serviceTiming.initial,
		serviceTiming.processing,
		serviceTiming.processingEnabled,
	]);

	const imageUri = useMemo(() => {
		if (!product) return "";
		return toCacheBustedImageUri(product.primaryImageUrl, product.updatedAt);
	}, [product]);

	const tileColor = useMemo(() => {
		if (!product) return "";
		return typeof product.posTileColor === "string" ? product.posTileColor.trim() : "";
	}, [product]);

	const hasPhoto = imageUri.length > 0 && !imageLoadFailed;
	const hasTileColor = !hasPhoto && tileColor.length > 0;

	useEffect(() => {
		setImageLoadFailed(false);
	}, [imageUri]);

	return (
		<BAIScreen padded={false} tabbed safeTop={false} safeBottom={false} safeAreaGradientBottom style={styles.root}>
			<BAIHeader title={screenTitle} variant='back' onLeftPress={onBack} disabled={isNavLocked} />

			<ScrollView
				style={[styles.bodyScroll, { backgroundColor: theme.colors.background }]}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps='handled'
			>
				<View style={styles.screen}>
					<View style={styles.centerWrap}>
						<View style={[styles.column, { maxWidth: DETAIL_MAX_WIDTH }]}>
							{query.isLoading ? (
								<BAISurface style={[styles.stateCard, { borderColor }]} padded bordered>
									<View style={styles.stateBlock}>
										<BAIActivityIndicator />
										<BAIText variant='caption' muted style={styles.stateMessage}>
											Loading item details...
										</BAIText>
									</View>
								</BAISurface>
							) : query.isError ? (
								<BAISurface style={[styles.stateCard, { borderColor }]} padded bordered>
									<View style={styles.stateBlock}>
										<BAIText variant='caption' muted style={styles.stateMessage}>
											{extractApiErrorMessage(query.error)}
										</BAIText>
										<BAIRetryButton onPress={onRetry} disabled={!itemId}>
											Retry
										</BAIRetryButton>
									</View>
								</BAISurface>
							) : !product ? (
								<BAISurface style={[styles.stateCard, { borderColor }]} padded bordered>
									<View style={styles.stateBlock}>
										<BAIText variant='caption' muted style={styles.stateMessage}>
											Item not found.
										</BAIText>
										<BAIButton
											mode='outlined'
											onPress={onBack}
											disabled={isNavLocked}
											shape='pill'
											widthPreset='standard'
										>
											Back
										</BAIButton>
									</View>
								</BAISurface>
							) : (
								<>
									<BAISurface
										style={[styles.heroCard, { borderColor, backgroundColor: theme.colors.surface }]}
										padded={false}
										bordered
									>
										<View style={styles.heroTopRow}>
											<View
												style={[
													styles.mediaHolder,
													{
														borderColor,
														backgroundColor: hasTileColor
															? tileColor
															: (theme.colors.surfaceVariant ?? theme.colors.surface),
													},
												]}
											>
												{hasPhoto ? (
													<Image
														source={{ uri: imageUri }}
														style={styles.mediaImage}
														resizeMode='cover'
														onError={() => setImageLoadFailed(true)}
													/>
												) : !hasTileColor ? (
													<View style={styles.mediaPlaceholder}>
														<FontAwesome6
															name='image'
															size={28}
															color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
														/>
													</View>
												) : null}
											</View>

											<View style={styles.heroTextWrap}>
												<View style={styles.heroChipRow}>
													<View
														style={[
															styles.statusChip,
															{
																borderColor,
																backgroundColor:
																	product.isActive === false
																		? (theme.colors.errorContainer ?? theme.colors.surfaceVariant)
																		: theme.colors.surface,
															},
														]}
													>
														<BAIText
															variant='caption'
															style={{
																color: product.isActive === false ? theme.colors.error : theme.colors.onSurface,
															}}
														>
															{product.isActive === false ? "Archived" : "Active"}
														</BAIText>
													</View>

													{categoryName ? (
														<View style={[styles.categoryBadge, { borderColor }]}>
															<View
																style={[
																	styles.categoryDot,
																	{
																		backgroundColor: categoryColor || "transparent",
																		borderColor: categoryColor || borderColor,
																	},
																]}
															/>
															<BAIText variant='caption' style={styles.categoryBadgeText} numberOfLines={1}>
																{categoryName}
															</BAIText>
														</View>
													) : null}
												</View>

												<BAIText variant='title' numberOfLines={2} style={styles.heroTitle}>
													{product.name}
												</BAIText>

												{heroMetaText ? (
													<BAIText
														variant='caption'
														numberOfLines={2}
														style={[styles.heroMetaText, { color: secondaryTextColor }]}
													>
														{heroMetaText}
													</BAIText>
												) : null}
											</View>
										</View>

										<View style={styles.summaryGrid}>
											{summaryCards.map((card) => (
												<View
													key={card.label}
													style={[styles.summaryTile, { borderColor, backgroundColor: theme.colors.surface }]}
												>
													<BAIText variant='caption' style={{ color: secondaryTextColor }}>
														{card.label}
													</BAIText>
													<BAIText
														variant='body'
														numberOfLines={2}
														ellipsizeMode='tail'
														style={styles.summaryValueText}
													>
														{card.value}
													</BAIText>
												</View>
											))}
										</View>
									</BAISurface>

									<BAISurface
										style={[styles.sectionCard, { borderColor, backgroundColor: theme.colors.surface }]}
										padded={false}
										bordered
									>
										<View style={[styles.sectionHeader, { borderBottomColor: borderColor }]}>
											<BAIText variant='subtitle' style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
												Details
											</BAIText>
											<BAIText variant='caption' style={{ color: secondaryTextColor }}>
												{detailsSubtitle}
											</BAIText>
										</View>

										<View style={styles.detailRows}>
											{detailRows.map((row, index) => (
												<View key={`${row.label}-${index}`}>
													<View style={styles.detailRow}>
														<BAIText variant='caption' style={[styles.detailLabel, { color: secondaryTextColor }]}>
															{row.label}
														</BAIText>
														<View style={styles.detailValueWrap}>
															{typeof row.value === "string" ? (
																<BAIText
																	variant='body'
																	numberOfLines={2}
																	ellipsizeMode='tail'
																	style={styles.detailValueText}
																>
																	{row.value}
																</BAIText>
															) : (
																row.value
															)}
														</View>
													</View>
													{index < detailRows.length - 1 ? (
														<View style={[styles.metaDivider, { backgroundColor: borderColor }]} />
													) : null}
												</View>
											))}
										</View>
									</BAISurface>
								</>
							)}
						</View>
					</View>
				</View>
			</ScrollView>
		</BAIScreen>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	bodyScroll: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: 200,
	},
	screen: {
		paddingHorizontal: 12,
		paddingTop: 10,
	},
	centerWrap: {
		alignItems: "center",
	},
	column: {
		width: "100%",
	},
	stateCard: {
		marginTop: 8,
		marginBottom: 0,
		borderRadius: 16,
	},
	stateBlock: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 24,
		gap: 12,
	},
	stateMessage: {
		textAlign: "center",
	},
	heroCard: {
		marginTop: 8,
		borderRadius: 24,
		padding: 16,
		gap: 16,
		backgroundColor: "transparent",
	},
	heroTopRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 14,
	},
	heroTextWrap: {
		flex: 1,
		minWidth: 0,
		gap: 10,
	},
	mediaHolder: {
		width: 88,
		height: 88,
		borderRadius: 20,
		borderWidth: 1,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	mediaImage: {
		width: "100%",
		height: "100%",
	},
	mediaPlaceholder: {
		flex: 1,
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
	},
	heroChipRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	statusChip: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
	},
	categoryBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
		maxWidth: "100%",
	},
	categoryBadgeText: {
		flexShrink: 1,
	},
	heroTitle: {
		fontSize: 22,
		lineHeight: 28,
		fontWeight: "700",
	},
	heroMetaText: {
		lineHeight: 18,
	},
	summaryGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
	},
	summaryTile: {
		width: "48%",
		minHeight: 76,
		borderRadius: 18,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 12,
		paddingVertical: 10,
		justifyContent: "space-between",
	},
	summaryValueText: {
		fontWeight: "600",
	},
	sectionCard: {
		marginTop: 14,
		borderRadius: 20,
		overflow: "hidden",
	},
	sectionHeader: {
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
		gap: 3,
	},
	sectionTitle: {
		fontWeight: "700",
	},
	detailRows: {
		gap: 0,
		paddingHorizontal: 16,
		paddingVertical: 6,
	},
	detailRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingVertical: 10,
		gap: 10,
	},
	detailLabel: {
		width: 104,
		paddingTop: 2,
	},
	detailValueWrap: {
		flex: 1,
		minWidth: 0,
	},
	inlineValueRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minWidth: 0,
		flex: 1,
	},
	categoryDot: {
		width: 10,
		height: 10,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
	},
	detailValueText: {
		fontWeight: "600",
		flexShrink: 1,
		lineHeight: 22,
	},
	metaDivider: {
		height: StyleSheet.hairlineWidth,
	},
});
