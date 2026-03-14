// BizAssist_mobile
// path: src/modules/inventory/screens/InventoryProductActivityScreen.tsx

import React, { useCallback, useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { BAITimeAgo } from "@/components/system/BAITimeAgo";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";

import { inventoryApi } from "@/modules/inventory/inventory.api";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import { InventoryMovementRow } from "@/modules/inventory/components/InventoryMovementRow";
import type { InventoryMovement, InventoryProductDetail } from "@/modules/inventory/inventory.types";
import { formatOnHand } from "@/modules/inventory/inventory.selectors";
import { toCacheBustedImageUri } from "@/modules/media/media.image";

function extractApiErrorMessage(err: any): string {
	const data = err?.response?.data;
	const msg = data?.message ?? data?.error?.message ?? err?.message ?? "Operation failed. Please try again.";
	return String(msg);
}

function clampPrecisionScale(value: unknown): number {
	const raw = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(raw)) return 0;
	return Math.max(0, Math.min(5, Math.trunc(raw)));
}

function formatScaledInt(raw: string, scale: number): string {
	const s = raw.trim();
	if (!/^-?\d+$/.test(s)) return raw;

	const neg = s.startsWith("-");
	const digits = neg ? s.slice(1) : s;
	if (scale <= 0) return (neg ? "-" : "") + (digits || "0");

	const padded = digits.padStart(scale + 1, "0");
	const intPart = padded.slice(0, -scale) || "0";
	const fracPart = padded.slice(-scale);
	return (neg ? "-" : "") + intPart + "." + fracPart;
}

function formatQuantityWithScale(value: unknown, scale: number): string | null {
	if (value === null || value === undefined) return null;

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			if (trimmed.includes(".")) {
				const neg = trimmed.startsWith("-");
				const [intRaw, fracRaw = ""] = (neg ? trimmed.slice(1) : trimmed).split(".");
				if (scale <= 0) return (neg ? "-" : "") + (intRaw || "0");
				const frac = (fracRaw + "0".repeat(scale)).slice(0, scale);
				return (neg ? "-" : "") + (intRaw || "0") + "." + frac;
			}
			return formatScaledInt(trimmed, scale);
		}
		return trimmed;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		if (scale <= 0) return String(Math.trunc(value));
		if (Number.isInteger(value)) return formatScaledInt(String(value), scale);
		return value.toFixed(scale);
	}

	return null;
}

function formatDecimalRawWithScale(value: unknown, scale: number): string | null {
	if (value === null || value === undefined) return null;

	// Raw-decimal mode (UDQI): treat integer strings as whole units (NOT scaled-int).
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;

		const neg = trimmed.startsWith("-");
		const body = neg ? trimmed.slice(1) : trimmed;
		const [intRaw, fracRaw = ""] = body.split(".");
		const intPart = intRaw || "0";
		if (scale <= 0) return (neg ? "-" : "") + intPart;

		const frac = (fracRaw + "0".repeat(scale)).slice(0, scale);
		return (neg ? "-" : "") + intPart + "." + frac;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		if (scale <= 0) return String(Math.trunc(value));
		return value.toFixed(scale);
	}

	return null;
}

function resolveUnitLabel(p: any): string | null {
	const normalize = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return null;
		if (trimmed.toLowerCase() === "ea") return "Per Piece";
		return trimmed;
	};

	const abbrRaw = String(p?.unitAbbreviation ?? p?.unit?.abbreviation ?? "");
	const abbr = normalize(abbrRaw);
	if (abbr) return abbr;

	const nameRaw = String(p?.unitName ?? p?.unit?.name ?? "");
	const name = normalize(nameRaw);
	return name || null;
}

function formatProductTypeLabel(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const normalized = trimmed.toUpperCase();
	if (normalized === "PHYSICAL" || normalized === "ITEM") return "Item";
	if (normalized === "SERVICE") return "Service";
	return trimmed;
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

type Params = { id?: string };

function InfoRow({
	label,
	value,
	divider,
	dividerColor,
	showCategoryDot,
	categoryDotColor,
	categoryDotBorderColor,
}: {
	label: string;
	value: string;
	divider?: boolean;
	dividerColor?: string;
	showCategoryDot?: boolean;
	categoryDotColor?: string | null;
	categoryDotBorderColor?: string;
}) {
	return (
		<View
			style={[
				styles.infoRow,
				divider ? [styles.infoRowDivider, dividerColor ? { borderBottomColor: dividerColor } : null] : null,
			]}
		>
			<View style={styles.infoLabelCol}>
				<BAIText variant='caption' muted style={styles.infoLabel}>
					{label}
				</BAIText>
			</View>

			<View style={styles.infoValueCol}>
				<View style={styles.infoValueInline}>
					{showCategoryDot ? (
						<View
							style={[
								styles.infoCategoryDot,
								{
									backgroundColor: categoryDotColor || "transparent",
									borderColor: categoryDotColor || categoryDotBorderColor || "transparent",
								},
							]}
						/>
					) : null}
					<BAIText variant='body' numberOfLines={2} style={styles.infoValue}>
						{value}
					</BAIText>
				</View>
			</View>
		</View>
	);
}

export default function InventoryProductActivityScreen() {
	const theme = useTheme();
	const router = useRouter();
	const params = useLocalSearchParams<Params>();

	const productId = useMemo(() => String(params.id ?? "").trim(), [params.id]);
	const enabled = !!productId;

	const productDetailQuery = useQuery<InventoryProductDetail>({
		queryKey: inventoryKeys.productDetail(productId),
		queryFn: () => inventoryApi.getProductDetail(productId),
		enabled,
		staleTime: 30_000,
	});

	const movementsQuery = useQuery<{ items: InventoryMovement[] }>({
		queryKey: inventoryKeys.movements(productId, 0),
		queryFn: async () => {
			const data = await inventoryApi.listMovements(productId);
			return { items: data.items };
		},
		enabled,
		staleTime: 30_000,
	});

	const product = productDetailQuery.data ?? null;
	const movements = useMemo(() => movementsQuery.data?.items ?? [], [movementsQuery.data?.items]);

	const unitPrecisionScale = useMemo(
		() => clampPrecisionScale((product as any)?.unitPrecisionScale ?? (product as any)?.unit?.precisionScale),
		[product],
	);

	const updatedAt = (product as any)?.updatedAt;
	const updatedAtLabel = useMemo(() => formatReadableTime(updatedAt), [updatedAt]);

	const movementsForDisplay = useMemo(() => {
		return movements.map((m) => {
			const anyM: any = m as any;

			// Prefer UDQI decimal when present
			const decimal = typeof anyM?.quantityDeltaDecimal === "string" ? anyM.quantityDeltaDecimal.trim() : "";
			if (decimal) {
				const normalized = formatDecimalRawWithScale(decimal, unitPrecisionScale) ?? decimal;
				return { ...anyM, quantityDeltaRaw: normalized };
			}

			// Normalize existing raw strings
			if (typeof anyM?.quantityDeltaRaw === "string" && anyM.quantityDeltaRaw.trim()) {
				const normalized = formatDecimalRawWithScale(anyM.quantityDeltaRaw, unitPrecisionScale);
				return normalized ? { ...anyM, quantityDeltaRaw: normalized } : anyM;
			}

			// Fallback: derive raw string from numeric delta
			if (typeof anyM?.quantityDelta === "number" && Number.isFinite(anyM.quantityDelta)) {
				const derived = formatQuantityWithScale(anyM.quantityDelta, unitPrecisionScale);
				return derived ? { ...anyM, quantityDeltaRaw: derived } : anyM;
			}

			return anyM;
		});
	}, [movements, unitPrecisionScale]);

	const onHandLabel = useMemo(() => {
		if (!product) return "—";
		return formatOnHand(product as any);
	}, [product]);

	const title = product?.name?.trim() ? product?.name : "Item";
	const imageUri = useMemo(() => {
		return toCacheBustedImageUri((product as any)?.primaryImageUrl, (product as any)?.updatedAt);
	}, [product]);
	const hasImage = Boolean(imageUri);
	const productType = (product as any)?.type;
	const typeLabel = useMemo(() => formatProductTypeLabel(productType), [productType]);
	const isActive = typeof (product as any)?.isActive === "boolean" ? (product as any)?.isActive : null;

	const categoryNameRaw =
		typeof (product as any)?.category?.name === "string"
			? (product as any)?.category?.name.trim()
			: typeof (product as any)?.categoryName === "string"
				? (product as any)?.categoryName.trim()
				: "";
	const categoryColorRaw =
		typeof (product as any)?.category?.color === "string"
			? (product as any)?.category?.color.trim()
			: typeof (product as any)?.categoryColor === "string"
				? (product as any)?.categoryColor.trim()
				: "";
	const categoryColor = categoryColorRaw || null;
	const hasCategory = categoryNameRaw.length > 0 && categoryNameRaw.toLowerCase() !== "none";

	const categoryName = categoryNameRaw && categoryNameRaw.toLowerCase() !== "none" ? categoryNameRaw : "None";

	const onRetry = useCallback(() => {
		if (!productId) return;
		productDetailQuery.refetch();
		movementsQuery.refetch();
	}, [productId, productDetailQuery, movementsQuery]);

	const onRetryActivity = useCallback(() => {
		if (!productId) return;
		movementsQuery.refetch();
	}, [productId, movementsQuery]);
	const onBack = useCallback(() => {
		if (router.canGoBack?.()) {
			router.back();
			return;
		}
		if (!productId) {
			router.back();
			return;
		}
		router.replace(`/(app)/(tabs)/inventory/products/${encodeURIComponent(productId)}` as any);
	}, [productId, router]);

	const onOpenMovement = useCallback(
		(movementId: string) => {
			if (!productId) return;
			const mid = String(movementId ?? "").trim();
			if (!mid) return;

			router.push({
				pathname: "/(app)/(tabs)/inventory/products/[id]/activity/[movementId]" as const,
				params: { id: productId, movementId: mid },
			});
		},
		[productId, router],
	);

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const surfaceAlt = theme.colors.surfaceVariant ?? theme.colors.surface;
	const thumbnailBg = theme.colors.surfaceVariant ?? theme.colors.surface;

	const metaRows = useMemo(() => {
		const items: { label: string; value: string; showDot?: boolean; dotColor?: string | null }[] = [];
		if (typeLabel) items.push({ label: "Type", value: typeLabel });
		const label = resolveUnitLabel(product);
		if (label) items.push({ label: "Unit", value: label });
		if (categoryName) {
			items.push({ label: "Category", value: categoryName, showDot: hasCategory, dotColor: categoryColor });
		}
		if (isActive !== null) items.push({ label: "Status", value: isActive ? "Active" : "Archived" });
		return items;
	}, [categoryColor, categoryName, hasCategory, isActive, product, typeLabel]);

	const activityCountLabel = useMemo(() => {
		if (movementsQuery.isLoading) return "Loading";
		if (movementsForDisplay.length === 1) return "1 movement";
		return `${movementsForDisplay.length} movements`;
	}, [movementsForDisplay.length, movementsQuery.isLoading]);

	const activityContent = (() => {
		if (movementsQuery.isLoading) {
			return (
				<View style={styles.center}>
					<BAIActivityIndicator />
				</View>
			);
		}

		if (movementsQuery.isError) {
			return (
				<View style={styles.center}>
					<BAIText variant='body' muted style={{ textAlign: "center" }}>
						{extractApiErrorMessage(movementsQuery.error)}
					</BAIText>

					<View style={styles.actions}>
						<BAIRetryButton mode='outlined' onPress={onRetryActivity} disabled={!productId}>
							Retry Activity
						</BAIRetryButton>
					</View>
				</View>
			);
		}

		if (movementsForDisplay.length === 0) {
			return (
				<View style={styles.emptyState}>
					<BAIText variant='body' muted>
						No activity yet.
					</BAIText>
					<BAIText variant='caption' muted style={{ marginTop: 6 }}>
						Stock adjustments and sales will appear here.
					</BAIText>
				</View>
			);
		}

		return (
			<View style={styles.movementList}>
				{movementsForDisplay.map((m) => {
					const mid = String((m as any).id ?? "").trim();
					const canOpen = !!productId && !!mid;

					return (
						<View key={(m as any).id}>
							<Pressable
								disabled={!canOpen}
								onPress={() => onOpenMovement(mid)}
								accessibilityRole='button'
								accessibilityLabel='View activity details'
								style={({ pressed }) => [styles.movementPressable, pressed && canOpen ? styles.pressed : null]}
							>
								<InventoryMovementRow movement={m} showDateTime precisionScale={unitPrecisionScale} unit={product} />
							</Pressable>
						</View>
					);
				})}
			</View>
		);
	})();

	if (!productId) {
		return (
			<BAIScreen padded={false} tabbed safeTop={false} safeBottom={false} style={styles.root}>
				<BAIHeader title='Item Activity List' variant='back' onLeftPress={onBack} />
				<View style={styles.fallbackScreen}>
					<BAIText variant='body' muted>
						Item not available.
					</BAIText>
				</View>
			</BAIScreen>
		);
	}

	if (productDetailQuery.isLoading && !product) {
		return (
			<BAIScreen padded={false} tabbed safeTop={false} safeBottom={false} style={styles.root}>
				<BAIHeader title='Item Activity List' variant='back' onLeftPress={onBack} />
				<View style={styles.fallbackScreen}>
					<View style={styles.center}>
						<BAIActivityIndicator />
					</View>
				</View>
			</BAIScreen>
		);
	}

	if (productDetailQuery.isError && !product) {
		return (
			<BAIScreen padded={false} tabbed safeTop={false} safeBottom={false} style={styles.root}>
				<BAIHeader title='Item Activity List' variant='back' onLeftPress={onBack} />
				<View style={styles.fallbackScreen}>
					<View style={styles.center}>
						<BAIText variant='body' muted style={{ textAlign: "center" }}>
							{extractApiErrorMessage(productDetailQuery.error)}
						</BAIText>
						<View style={styles.actions}>
							<BAIRetryButton mode='outlined' onPress={onRetry} disabled={!productId}>
								Retry
							</BAIRetryButton>
						</View>
					</View>
				</View>
			</BAIScreen>
		);
	}

	return (
		<BAIScreen tabbed padded={false} safeTop={false} safeBottom={false} style={styles.root}>
			<BAIHeader title='Item Activity List' variant='back' onLeftPress={onBack} />
			<View style={styles.screen}>
				{/* CONSOLIDATED CARD */}
				<BAISurface style={[styles.card, styles.unifiedCard]} padded={false}>
					<View style={styles.heroSection}>
						<View style={styles.heroHeader}>
							<View style={[styles.thumbnail, { borderColor, backgroundColor: thumbnailBg }]}>
								{hasImage ? (
									<Image source={{ uri: imageUri }} style={styles.thumbnailImage} resizeMode='cover' />
								) : (
									<View style={styles.thumbnailPlaceholder}>
										<MaterialCommunityIcons
											name='image-outline'
											size={50}
											color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
										/>
									</View>
								)}
							</View>

							<View style={styles.heroInfo}>
								<BAIText variant='title' numberOfLines={2} ellipsizeMode='tail' style={styles.heroNameLeft}>
									{title}
								</BAIText>
								<View style={styles.onHandRow}>
									<BAIText variant='caption' muted>
										On Hand
									</BAIText>
									<BAIText variant='subtitle' style={styles.onHandValue} numberOfLines={1} ellipsizeMode='tail'>
										{onHandLabel}
									</BAIText>
								</View>
								{updatedAt ? (
									<View style={styles.onHandTimeWrap}>
										<BAIText variant='caption' muted>
											Updated:
										</BAIText>
										{updatedAtLabel ? (
											<View style={styles.heroTimeRow}>
												<BAIText variant='caption' muted>
													{updatedAtLabel}
												</BAIText>
												<BAIText variant='caption' muted style={styles.heroInlineSep}>
													|
												</BAIText>
												<BAITimeAgo value={updatedAt} variant='caption' muted />
											</View>
										) : (
											<BAITimeAgo value={updatedAt} variant='caption' muted />
										)}
									</View>
								) : null}
							</View>
						</View>

						{metaRows.length > 0 ? (
							<View style={styles.metaBlock}>
								<View
									style={[
										styles.panel,
										{ borderColor, backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface },
									]}
								>
									{metaRows.map((row, idx) => (
										<InfoRow
											key={`${row.label}-${row.value}`}
											label={row.label}
											value={row.value}
											divider={idx < metaRows.length - 1}
											dividerColor={borderColor}
											showCategoryDot={row.showDot}
											categoryDotColor={row.dotColor}
											categoryDotBorderColor={borderColor}
										/>
									))}
								</View>
							</View>
						) : null}
					</View>

					<View style={styles.sectionHeader}>
						<View style={styles.sectionHeaderText}>
							<BAIText variant='subtitle'>Activity Log</BAIText>
							<BAIText variant='caption' muted numberOfLines={1}>
								All inventory movements for this item.
							</BAIText>
						</View>

						<View style={[styles.countPill, { borderColor, backgroundColor: surfaceAlt }]}>
							<BAIText variant='caption' muted>
								{activityCountLabel}
							</BAIText>
						</View>
					</View>

					<ScrollView
						style={styles.sectionBody}
						contentContainerStyle={styles.sectionBodyContent}
						showsVerticalScrollIndicator={false}
					>
						{activityContent}
					</ScrollView>
				</BAISurface>
			</View>
		</BAIScreen>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },

	screen: { flex: 1, paddingHorizontal: 12, paddingBottom: 0, paddingTop: 0, gap: 0 },
	fallbackScreen: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

	card: { overflow: "hidden" },
	unifiedCard: { flex: 1, minHeight: 0 },

	center: { padding: 18, alignItems: "center", justifyContent: "center" },

	actions: {
		marginTop: 12,
		flexDirection: "row",
		gap: 10,
	},

	emptyState: { paddingVertical: 6 },

	// HERO
	heroSection: {
		padding: 14,
		paddingBottom: 12,
	},
	heroHeader: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: 14,
	},
	heroInfo: {
		flex: 1,
		minWidth: 0,
		minHeight: 72,
		gap: 6,
		justifyContent: "flex-end",
	},
	thumbnail: {
		width: 72,
		height: 72,
		borderRadius: 18,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
		alignSelf: "flex-start",
	},
	thumbnailImage: { width: "100%", height: "100%" },
	thumbnailPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },

	heroNameLeft: {
		alignSelf: "flex-start",
	},
	onHandValue: { fontWeight: "700" },
	onHandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	onHandTimeWrap: {
		marginTop: 2,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		flexWrap: "wrap",
	},

	metaBlock: { marginTop: 12, gap: 12 },

	panel: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		overflow: "hidden",
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	infoRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
	infoLabelCol: { width: 92, paddingTop: 1 },
	infoValueCol: { flex: 1 },
	infoValueInline: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minWidth: 0,
	},
	infoCategoryDot: {
		width: 12,
		height: 12,
		borderRadius: 9,
		borderWidth: 1,
	},
	infoLabel: { opacity: 0.85 },
	infoValue: { lineHeight: 20 },

	heroTimeRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		flexWrap: "wrap",
	},
	heroInlineSep: {
		marginHorizontal: 2,
	},

	// ACTIVITY
	sectionHeader: {
		paddingHorizontal: 12,
		paddingBottom: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	sectionHeaderText: { flex: 1, minWidth: 0, gap: 2 },
	countPill: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	sectionBody: { flex: 1 },
	sectionBodyContent: { paddingHorizontal: 12, paddingVertical: 10 },

	movementList: { gap: 10 },
	movementPressable: { borderRadius: 12, overflow: "hidden" },
	pressed: { opacity: 0.86 },
});
