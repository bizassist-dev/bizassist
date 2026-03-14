// BizAssist_mobile
// path: app/(app)/(tabs)/inventory/products/[id]/activity/[movementId].tsx
//
// Header governance:
// - This is a DETAIL screen (drill-down from Activity List).
// - Use BACK (history) only. No Exit/cancel semantics here.

import React, { useCallback, useMemo } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { BAITimeAgo } from "@/components/system/BAITimeAgo";

import { inventoryApi } from "@/modules/inventory/inventory.api";
import type { InventoryMovement, InventoryProductDetail } from "@/modules/inventory/inventory.types";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import { toCacheBustedImageUri } from "@/modules/media/media.image";
import { unitDisplayToken } from "@/modules/units/units.format";

type Params = { id?: string; movementId?: string };

function extractApiErrorMessage(err: any): string {
	const data = err?.response?.data;
	const msg = data?.message ?? data?.error?.message ?? err?.message ?? "Operation failed. Please try again.";
	return String(msg);
}

function isMeaningfulText(v: unknown): v is string {
	if (typeof v !== "string") return false;
	const t = v.trim();
	return !!t && t !== "-" && t !== "—" && t !== "–";
}

function reasonLabel(reason: unknown): string {
	const r = typeof reason === "string" ? reason.trim().toUpperCase() : "";
	if (!r) return "Adjustment";
	if (r === "STOCK_IN") return "Stock In";
	if (r === "STOCK_OUT") return "Stock Out";
	if (r === "ADJUSTMENT") return "Adjustment";
	if (r === "SALE") return "Sale";
	return r.replace(/_/g, " ");
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

	// UDQI transport: treat integer strings as whole units (NOT scaled-int).
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

type QuantityMode = "raw-decimal" | "scaled-int";

function formatSignedQuantity(value: unknown, scale: number, mode: QuantityMode): string {
	const base = mode === "raw-decimal" ? formatDecimalRawWithScale(value, scale) : formatQuantityWithScale(value, scale);
	if (!base) return "—";
	if (base.startsWith("-")) return base;
	return `+${base}`;
}

function formatSignedQuantityWithUnit(value: unknown, scale: number, unitSource: any, mode: QuantityMode): string {
	const baseSigned = formatSignedQuantity(value, scale, mode);
	if (baseSigned === "—") return baseSigned;
	const unitToken = unitDisplayToken(unitSource, "quantity", value);
	return unitToken ? `${baseSigned} ${unitToken}` : baseSigned;
}

function resolveMovementDelta(movement: any): { value: unknown; mode: QuantityMode } {
	const decimal = typeof movement?.quantityDeltaDecimal === "string" ? movement.quantityDeltaDecimal.trim() : "";
	if (decimal) return { value: decimal, mode: "raw-decimal" };

	const raw = typeof movement?.quantityDeltaRaw === "string" ? movement.quantityDeltaRaw.trim() : "";
	// UDQI compatibility: treat quantityDeltaRaw as raw-decimal magnitude even if it has no dot.
	if (raw) return { value: raw, mode: "raw-decimal" };

	const scaled =
		typeof movement?.quantityDeltaScaledInt === "number" && Number.isFinite(movement.quantityDeltaScaledInt)
			? movement.quantityDeltaScaledInt
			: null;
	if (scaled !== null) return { value: scaled, mode: "scaled-int" };

	const legacy =
		typeof movement?.quantityDelta === "number" && Number.isFinite(movement.quantityDelta)
			? movement.quantityDelta
			: null;
	return { value: legacy, mode: "scaled-int" };
}

function formatReadableTime(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const d = new Date(trimmed);
	if (!Number.isFinite(d.getTime())) return trimmed;
	const datePart = d.toLocaleDateString();
	const timePart = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	return `${datePart}, ${timePart}`;
}

function InfoRow({
	label,
	value,
	subValue,
	divider,
	dividerColor,
}: {
	label: string;
	value: React.ReactNode;
	subValue?: React.ReactNode;
	divider?: boolean;
	dividerColor?: string;
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
				{typeof value === "string" ? (
					<BAIText variant='body' numberOfLines={2} style={styles.infoValue}>
						{value}
					</BAIText>
				) : (
					<View style={styles.valueInline}>{value}</View>
				)}

				{subValue ? <View style={styles.subValueWrap}>{subValue}</View> : null}
			</View>
		</View>
	);
}

export default function InventoryMovementDetailScreen() {
	const router = useRouter();
	const theme = useTheme();
	const params = useLocalSearchParams<Params>();

	const productId = useMemo(() => String(params.id ?? "").trim(), [params.id]);
	const movementId = useMemo(() => String(params.movementId ?? "").trim(), [params.movementId]);
	const enabled = !!productId && !!movementId;
	const onBack = useCallback(() => {
		if (router.canGoBack?.()) {
			router.back();
			return;
		}
		if (!productId) {
			router.back();
			return;
		}
		router.replace(`/(app)/(tabs)/inventory/products/${encodeURIComponent(productId)}/activity` as any);
	}, [productId, router]);

	// Identity anchor (product name + on-hand). Read-only and safe.
	const productDetailQuery = useQuery<InventoryProductDetail>({
		queryKey: inventoryKeys.productDetail(productId),
		queryFn: () => inventoryApi.getProductDetail(productId),
		enabled: !!productId,
		staleTime: 30_000,
	});

	// v1 implementation: list + locate movement (no new endpoint).
	const movementQuery = useQuery<{ items: InventoryMovement[] }>({
		queryKey: ["inventory", "movementDetail", productId, movementId],
		queryFn: async () => {
			const data = await inventoryApi.listMovements(productId, { limit: 50 });
			return { items: data.items };
		},
		enabled,
		staleTime: 30_000,
	});

	const productName = productDetailQuery.data?.name?.trim() ? productDetailQuery.data?.name : "Item";
	const imageUri = useMemo(() => {
		return toCacheBustedImageUri(
			(productDetailQuery.data as any)?.primaryImageUrl,
			(productDetailQuery.data as any)?.updatedAt,
		);
	}, [productDetailQuery.data]);
	const hasImage = Boolean(imageUri);
	const unitPrecisionScale = useMemo(
		() =>
			clampPrecisionScale(
				(productDetailQuery.data as any)?.unitPrecisionScale ?? (productDetailQuery.data as any)?.unit?.precisionScale,
			),
		[productDetailQuery.data],
	);

	const movement = useMemo(() => {
		const items = movementQuery.data?.items ?? [];
		return items.find((m) => String(m.id ?? "").trim() === movementId) ?? null;
	}, [movementId, movementQuery.data?.items]);

	const isLoading = (enabled && movementQuery.isLoading) || productDetailQuery.isLoading;
	const isError = (enabled && movementQuery.isError) || productDetailQuery.isError;

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const thumbnailBg = theme.colors.surfaceVariant ?? theme.colors.surface;
	const createdAtRaw = (movement as any)?.createdAt ?? (movement as any)?.timestamp;
	const createdAtLabel = formatReadableTime(createdAtRaw);
	const note = (movement as any)?.note;

	const rawReason = (movement as any)?.reason;
	const reason = reasonLabel(rawReason);
	const deltaResolved = resolveMovementDelta(movement as any);
	const delta = formatSignedQuantityWithUnit(
		deltaResolved.value,
		unitPrecisionScale,
		productDetailQuery.data,
		deltaResolved.mode,
	);

	const isStockOut =
		typeof rawReason === "string" ? rawReason.trim().toUpperCase() === "STOCK_OUT" : reason === "Stock Out";

	const subtitle = useMemo(() => {
		const parts = [reason, delta].filter(Boolean);
		return parts.join(" • ");
	}, [reason, delta]);

	return (
		<BAIScreen
			padded={false}
			tabbed
			scroll
			safeTop={false}
			safeBottom={false}
			style={styles.root}
			contentContainerStyle={styles.screen}
			scrollProps={{ showsVerticalScrollIndicator: false }}
		>
			<BAIHeader title='Activity Details' variant='back' onLeftPress={onBack} />

			<View style={styles.content}>
				<BAISurface style={styles.card} padded>
					{isLoading ? (
						<View style={styles.center}>
							<BAIActivityIndicator />
						</View>
					) : isError ? (
						<View style={styles.center}>
							<View style={styles.errorHeaderRow}>
								<BAIText variant='subtitle' numberOfLines={1}>
									Activity Details
								</BAIText>

								<BAIText variant='body' muted numberOfLines={1} style={styles.errorHeaderMsg}>
									{extractApiErrorMessage(movementQuery.error ?? productDetailQuery.error)}
								</BAIText>
							</View>
						</View>
					) : !enabled ? (
						<View style={styles.center}>
							<BAIText variant='subtitle'>Activity Details</BAIText>
							<BAIText variant='body' muted style={styles.centerMsg}>
								Missing item or activity identifier.
							</BAIText>
						</View>
					) : !movement ? (
						<View style={styles.center}>
							<BAIText variant='title' numberOfLines={1}>
								Activity not available
							</BAIText>
							<BAIText variant='body' muted style={styles.centerMsg}>
								This activity may have been removed from the recent list.
							</BAIText>
						</View>
					) : (
						<>
							{/* ITEM (INLINE) */}
							<View style={styles.itemInlineRow}>
								<View style={[styles.headerThumb, { borderColor, backgroundColor: thumbnailBg }]}>
									{hasImage ? (
										<Image source={{ uri: imageUri }} style={styles.headerThumbImage} resizeMode='cover' />
									) : (
										<View style={styles.headerThumbPlaceholder}>
											<MaterialCommunityIcons
												name='image-outline'
												size={50}
												color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
											/>
										</View>
									)}
								</View>

								<View style={styles.itemInlineText}>
									<BAIText variant='title' numberOfLines={1} style={styles.itemName}>
										{productName}
									</BAIText>
									{subtitle ? (
										<BAIText variant='caption' muted numberOfLines={1} style={styles.itemMeta}>
											{subtitle}
										</BAIText>
									) : null}
								</View>
							</View>

							<View style={[styles.divider, { backgroundColor: borderColor }]} />

							{/* MOVEMENT */}
							<View style={styles.sectionGap} />

							<View style={styles.sectionHeader}>
								<BAIText variant='subtitle'>Movement</BAIText>
							</View>

							<View
								style={[
									styles.panel,
									{ borderColor, backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface },
								]}
							>
								<InfoRow label='Reason' value={reason} divider dividerColor={borderColor} />
								<InfoRow
									label='Quantity'
									value={
										<BAIText
											variant='body'
											style={[styles.infoValue, isStockOut ? { color: theme.colors.error } : null]}
										>
											{delta}
										</BAIText>
									}
									divider
									dividerColor={borderColor}
								/>

								<InfoRow
									label='Created'
									value={createdAtLabel ?? "—"}
									subValue={
										createdAtRaw ? (
											<View style={styles.valueInline}>
												<BAIText variant='caption' muted>
													Relative:
												</BAIText>
												<BAITimeAgo value={createdAtRaw} variant='caption' muted />
											</View>
										) : null
									}
									divider={isMeaningfulText(note) || true}
									dividerColor={borderColor}
								/>

								{isMeaningfulText(note) ? (
									<InfoRow label='Note' value={String(note).trim()} divider dividerColor={borderColor} />
								) : null}
							</View>

							<BAIText variant='caption' muted style={styles.footerNote}>
								Read-only audit view. No edits are permitted on this screen.
							</BAIText>
						</>
					)}
				</BAISurface>
			</View>
		</BAIScreen>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },

	content: {
		paddingHorizontal: 12,
	},
	screen: {
		paddingBottom: 12,
		paddingTop: 0,
		gap: 12,
	},

	card: {
		overflow: "hidden",
		gap: 12,
	},

	center: {
		padding: 16,
		alignItems: "center",
		justifyContent: "center",
	},

	centerMsg: {
		marginTop: 8,
		textAlign: "center",
	},
	errorHeaderRow: {
		alignSelf: "stretch",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	errorHeaderMsg: {
		flex: 1,
		textAlign: "right",
	},

	headerThumb: {
		width: 72,
		height: 72,
		borderRadius: 18,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
		alignSelf: "flex-start",
	},
	headerThumbImage: { width: "100%", height: "100%" },
	headerThumbPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
	itemInlineRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	itemInlineText: {
		flex: 1,
		minWidth: 0,
		gap: 6,
	},
	itemName: {
		lineHeight: 24,
	},
	itemMeta: {
		opacity: 0.9,
	},

	deltaPill: {
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 6,
		alignItems: "center",
		gap: 2,
	},

	deltaLabel: {
		fontSize: 11,
	},

	divider: {
		height: StyleSheet.hairlineWidth,
		opacity: 0.9,
	},

	sectionHeader: {
		marginTop: 2,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
	},
	sectionHeaderInline: { flexDirection: "row", alignItems: "center", gap: 6 },

	sectionGap: {
		height: 6,
	},

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

	infoRowDivider: {
		borderBottomWidth: StyleSheet.hairlineWidth,
	},

	infoLabelCol: {
		width: 92,
		paddingTop: 1,
	},

	infoValueCol: {
		flex: 1,
	},

	infoLabel: {
		opacity: 0.85,
	},

	infoValue: {
		lineHeight: 20,
	},

	valueInline: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 6,
	},

	subValueWrap: {
		marginTop: 2,
	},

	footerNote: {
		marginTop: 8,
	},
});
