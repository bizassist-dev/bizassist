// BizAssist_mobile
// path: src/modules/inventory/screens/InventoryProductDetailScreen.tsx

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";
import { FontAwesome6 } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { BAITimeAgo } from "@/components/system/BAITimeAgo";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAICTAPillButton } from "@/components/ui/BAICTAButton";
import { BAIConfirmArchiveModal, BAIConfirmRestoreModal } from "@/components/ui/BAIConfirmEntityActionModal";
import { BAIIconButton } from "@/components/ui/BAIIconButton";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { formatMoney } from "@/shared/money/money.format";

import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { categoriesApi } from "@/modules/categories/categories.api";
import { categoryKeys } from "@/modules/categories/categories.queries";
import type { Category } from "@/modules/categories/categories.types";
import { InventoryMovementRow } from "@/modules/inventory/components/InventoryMovementRow";
import { PosTileTextOverlay } from "@/modules/inventory/components/PosTileTextOverlay";
import { inventoryApi } from "@/modules/inventory/inventory.api";
import { invalidateInventoryAfterMutation } from "@/modules/inventory/inventory.invalidate";
import { useProductCreateDraft } from "@/modules/inventory/drafts/useProductCreateDraft";
import { LOCAL_URI_KEY } from "@/modules/inventory/posTile.contract";
import {
	inventoryScopeRoot,
	mapInventoryRouteToScope,
	type InventoryRouteScope,
} from "@/modules/inventory/navigation.scope";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import { formatOnHand } from "@/modules/inventory/inventory.selectors";
import type { InventoryMovement, InventoryProductDetail } from "@/modules/inventory/inventory.types";
import { useInventoryHeader } from "@/modules/inventory/useInventoryHeader";
import { toCacheBustedImageUri } from "@/modules/media/media.image";
import { unitsApi } from "@/modules/units/units.api";
import { unitDisplayToken } from "@/modules/units/units.format";
import { unitKeys } from "@/modules/units/units.queries";
import type { Unit } from "@/modules/units/units.types";
import {
	DRAFT_ID_KEY as OPTION_DRAFT_ID_KEY,
	PRODUCT_ID_KEY,
	PRODUCT_SELECT_OPTIONS_ROUTE,
	RETURN_TO_KEY as OPTION_RETURN_TO_KEY,
} from "@/modules/options/productOptionPicker.contract";
import { useNavLock } from "@/shared/hooks/useNavLock";
import { useOperationalQueryAutoRefresh } from "@/shared/hooks/useOperationalQueryAutoRefresh";
import { sanitizeLabelInput, sanitizeProductNameInput } from "@/shared/validation/sanitize";
import { useAppBusy } from "@/hooks/useAppBusy";
import { useAppToast } from "@/providers/AppToastProvider";

function extractApiErrorMessage(err: any): string {
	const data = err?.response?.data;
	const msg = data?.message ?? data?.error?.message ?? err?.message ?? "Operation failed. Please try again.";
	return String(msg);
}

function isMeaningfulDetailText(v: unknown): v is string {
	if (typeof v !== "string") return false;
	const trimmed = v.trim();
	if (!trimmed) return false;
	return trimmed !== "-" && trimmed !== "—" && trimmed !== "–";
}

function formatMoneyLike(v: unknown): string | null {
	if (typeof v === "number" && Number.isFinite(v)) return v.toFixed(2);
	if (typeof v === "string") {
		const n = Number(v);
		if (Number.isFinite(n)) return n.toFixed(2);
	}
	return null;
}

function formatMoneyWithCurrency(value: unknown, currencyCode: string): string | null {
	const base = formatMoneyLike(value);
	if (!base) return null;
	return formatMoney({ amount: base, currencyCode });
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

/**
 * Screen-level display rule (MINIMUM SAFE FIX):
 * For the Each unit, render Unit Type as "Per Piece (pc)" instead of "Each (ea)".
 * This is ONLY for the "Unit type" row here; pricing/quantity tokens remain driven by unitDisplayToken().
 */
function isEachUnitNameOrAbbr(name: string, abbr: string): boolean {
	const n = name.trim().toLowerCase();
	const a = abbr.trim().toLowerCase();
	return n === "each" || a === "ea" || a === "each";
}

function formatUnitTypeLabel(p: any): string | null {
	const unitObj = p?.unit && typeof p.unit === "object" ? p.unit : null;

	const name =
		(typeof unitObj?.name === "string" ? unitObj.name.trim() : "") ||
		(typeof p?.unitName === "string" ? p.unitName.trim() : "") ||
		"";

	const abbr =
		(typeof unitObj?.abbreviation === "string" ? unitObj.abbreviation.trim() : "") ||
		(typeof p?.unitAbbreviation === "string" ? p.unitAbbreviation.trim() : "") ||
		"";

	const displayName = isEachUnitNameOrAbbr(name, abbr) ? "Per Piece" : name;

	const trimmedName = displayName.trim();
	if (!trimmedName) return null;
	return trimmedName;
}

function formatUnitAbbreviation(p: any): string | null {
	const unitObj = p?.unit && typeof p.unit === "object" ? p.unit : null;

	const name =
		(typeof unitObj?.name === "string" ? unitObj.name.trim() : "") ||
		(typeof p?.unitName === "string" ? p.unitName.trim() : "") ||
		"";

	const abbr =
		(typeof unitObj?.abbreviation === "string" ? unitObj.abbreviation.trim() : "") ||
		(typeof p?.unitAbbreviation === "string" ? p.unitAbbreviation.trim() : "") ||
		"";

	if (isEachUnitNameOrAbbr(name, abbr)) return "pc";
	if (abbr) return abbr;
	return null;
}

function formatSelectedUnitLabel(p: any): string | null {
	const unitType = formatUnitTypeLabel(p);
	if (!unitType) return null;
	const unitAbbr = formatUnitAbbreviation(p);
	if (!unitAbbr) return unitType;
	return `${unitType} (${unitAbbr})`;
}

function formatMoneyWithUnit(value: unknown, currencyCode: string, p: any): string | null {
	const money = formatMoneyWithCurrency(value, currencyCode);
	if (!money) return null;
	const unitToken = unitDisplayToken(p, "pricing");
	return unitToken ? `${money} / ${unitToken}` : money;
}

function clampPrecisionScale(value: unknown): number {
	const raw = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(raw)) return 0;
	return Math.max(0, Math.min(5, Math.trunc(raw)));
}

function formatDecimalRawWithScale(value: string | number, scale: number): string | null {
	const raw = typeof value === "number" ? String(value) : value;
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const normalized = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
	if (!/^-?\d+(\.\d+)?$/.test(normalized)) return trimmed;

	if (!normalized.includes(".")) {
		return scale > 0 ? `${normalized}.${"0".repeat(scale)}` : normalized;
	}

	const neg = normalized.startsWith("-");
	const body = neg ? normalized.slice(1) : normalized;
	const [intPartRaw, fracRaw = ""] = body.split(".");
	const frac = (fracRaw + "0".repeat(scale)).slice(0, scale);
	const intPart = intPartRaw || "0";
	return (neg ? "-" : "") + intPart + (scale > 0 ? `.${frac}` : "");
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

/**
 * Quantity formatting for this screen (UDQI-safe):
 * - Decimal strings with '.' are treated as major units; padded/clipped to scale.
 * - Integer strings (no '.') are treated as legacy scaled-int.
 * - Numbers are treated as major units (NOT scaled-int), then toFixed(scale).
 *
 * NOTE: This helper is safe only when the caller has already decided the interpretation mode.
 */
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

			// legacy scaled-int string
			return formatScaledInt(trimmed, scale);
		}

		return trimmed;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		if (scale <= 0) return String(Math.trunc(value));
		return value.toFixed(scale);
	}

	return null;
}

type QuantityDisplay = { value: string | number | null; mode: "raw-decimal" | "scaled-int" };

/**
 * UDQI resolution to prevent ambiguity (MASTERPLAN):
 * - decimal string field (e.g., onHandDecimal) is authoritative and ALWAYS decimal-major.
 * - raw string field (e.g., onHandCachedRaw / reorderPointRaw) is ALSO UDQI decimal-major (even if it has no dot).
 * - scaledInt field is legacy scaled-int.
 * - legacy numeric fallback is treated as legacy scaled-int (last resort).
 */
function resolveQuantityDisplay(p: any, kind: "onHand" | "reorder", _precisionScale: number): QuantityDisplay {
	const decimalKey = kind === "onHand" ? "onHandDecimal" : "reorderPointDecimal";
	const rawKey = kind === "onHand" ? "onHandCachedRaw" : "reorderPointRaw";
	const scaledKey = kind === "onHand" ? "onHandScaledInt" : "reorderPointScaledInt";
	const legacyKey = kind === "onHand" ? "onHandCached" : "reorderPoint";

	const decimal = typeof p?.[decimalKey] === "string" ? String(p[decimalKey]).trim() : "";
	if (decimal) return { value: decimal, mode: "raw-decimal" };

	// ✅ MASTERPLAN FIX:
	// Treat *Raw fields as UDQI decimal-major strings ALWAYS (even when "50" has no dot).
	// This prevents "50" @ scale=2 from rendering "0.50" (scaled-int) instead of "50.00" (decimal-major).
	const raw = typeof p?.[rawKey] === "string" ? String(p[rawKey]).trim() : "";
	if (raw) return { value: raw, mode: "raw-decimal" };

	const scaled = typeof p?.[scaledKey] === "number" && Number.isFinite(p[scaledKey]) ? (p as any)[scaledKey] : null;
	if (scaled !== null) return { value: scaled, mode: "scaled-int" };

	const legacy = typeof p?.[legacyKey] === "number" && Number.isFinite(p[legacyKey]) ? (p as any)[legacyKey] : null;
	return { value: legacy, mode: "scaled-int" };
}

/**
 * CRITICAL UDQI DISPLAY FIX:
 * When mode === "scaled-int" and the value is a number, treat it as an integer scaled-int (legacy),
 * NOT as a decimal-major number.
 */
function formatResolvedQuantity(resolved: QuantityDisplay, precisionScale: number): string | null {
	if (resolved.value === null || resolved.value === undefined) return null;

	if (resolved.mode === "raw-decimal") {
		return formatDecimalRawWithScale(String(resolved.value), precisionScale);
	}

	// scaled-int
	if (typeof resolved.value === "number" && Number.isFinite(resolved.value)) {
		const rawInt = String(Math.trunc(resolved.value));
		return formatScaledInt(rawInt, precisionScale);
	}

	if (typeof resolved.value === "string") {
		const trimmed = resolved.value.trim();
		if (!trimmed) return null;
		if (/^-?\d+$/.test(trimmed)) return formatScaledInt(trimmed, precisionScale);
		return formatQuantityWithScale(trimmed, precisionScale);
	}

	return null;
}

function formatUnitCategoryLabel(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const normalized = trimmed.toUpperCase();
	if (normalized === "COUNT") return "Count";
	if (normalized === "WEIGHT") return "Weight";
	if (normalized === "VOLUME") return "Volume";
	if (normalized === "LENGTH") return "Length";
	if (normalized === "AREA") return "Area";
	if (normalized === "TIME") return "Time";
	if (normalized === "CUSTOM") return "Custom";
	return trimmed;
}

function formatPrecisionLabel(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const raw = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(raw)) return null;
	const clamped = Math.max(0, Math.min(5, Math.trunc(raw)));
	if (clamped <= 0) return "Whole units (1)";
	const suffix = clamped === 1 ? "decimal" : "decimals";
	return `${clamped} ${suffix} (.${"0".repeat(Math.max(1, clamped))})`;
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

function MetaRow({
	label,
	value,
	divider,
	dividerColor,
}: {
	label: string;
	value: React.ReactNode;
	divider?: boolean;
	dividerColor?: string;
}) {
	return (
		<View
			style={[
				styles.metaRow,
				divider ? [styles.metaRowDivider, dividerColor ? { borderBottomColor: dividerColor } : null] : null,
			]}
		>
			<BAIText variant='caption' muted style={styles.metaLabel}>
				{label}
			</BAIText>

			<View style={styles.metaValueCol}>
				{typeof value === "string" ? (
					<BAIText variant='body' numberOfLines={1} ellipsizeMode='tail' style={styles.metaValueText}>
						{value}
					</BAIText>
				) : (
					value
				)}
			</View>
		</View>
	);
}

export default function InventoryProductDetailScreen({
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
	const rootRoute = useMemo(() => inventoryScopeRoot(routeScope), [routeScope]);
	const { currencyCode } = useActiveBusinessMeta();
	const operationalRefreshInterval = useOperationalQueryAutoRefresh();

	const params = useLocalSearchParams<{ id: string; localUri?: string }>();
	const productId = useMemo(() => String(params.id ?? "").trim(), [params.id]);
	const incomingLocalImageUri = useMemo(() => String(params[LOCAL_URI_KEY] ?? "").trim(), [params]);
	const optionsDraftId = useMemo(() => (productId ? `item_edit_${productId}` : ""), [productId]);
	const { patch: patchOptionsDraft } = useProductCreateDraft(optionsDraftId || undefined);
	const enabled = !!productId;
	const [optimisticImageUri, setOptimisticImageUri] = useState("");
	const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
	const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);

	const productDetailQuery = useQuery<InventoryProductDetail>({
		queryKey: inventoryKeys.productDetail(productId),
		queryFn: () => inventoryApi.getProductDetail(productId),
		enabled,
		staleTime: 30_000,
		refetchInterval: enabled ? operationalRefreshInterval : false,
		refetchIntervalInBackground: false,
	});

	const movementsQuery = useQuery<{ items: InventoryMovement[] }>({
		queryKey: inventoryKeys.movements(productId, 5),
		queryFn: async () => {
			const data = await inventoryApi.listMovements(productId, { limit: 5 });
			return { items: data.items };
		},
		enabled,
		staleTime: 30_000,
		refetchInterval: enabled ? operationalRefreshInterval : false,
		refetchOnMount: "always",
		refetchOnReconnect: "always",
		refetchOnWindowFocus: "always",
		refetchIntervalInBackground: false,
	});

	const unitsQuery = useQuery<Unit[]>({
		queryKey: unitKeys.list({ includeArchived: true }),
		queryFn: () => unitsApi.listUnits({ includeArchived: true }),
		enabled,
		staleTime: 30_000,
	});

	const categoriesQuery = useQuery<{ items: Category[] }>({
		queryKey: categoryKeys.list({ limit: 250 }),
		queryFn: () => categoriesApi.list({ limit: 250 }),
		staleTime: 30_000,
	});

	const product = productDetailQuery.data ?? null;
	const movements = useMemo(() => movementsQuery.data?.items ?? [], [movementsQuery.data?.items]);
	const onBackToInventory = useCallback(() => {
		if (!canNavigate) return;
		router.replace(rootRoute as any);
	}, [canNavigate, rootRoute, router]);
	const backLabel = routeScope === "settings-items-services" ? "Items" : "Inventory";

	const headerOptions = useInventoryHeader("detail", {
		title: "Item Details Overview",
		headerBackTitle: backLabel,
		backLabel,
		onBack: onBackToInventory,
	});

	const unitById = useMemo(() => {
		const map = new Map<string, Unit>();
		(unitsQuery.data ?? []).forEach((unit) => map.set(unit.id, unit));
		return map;
	}, [unitsQuery.data]);

	const productWithResolvedUnit = useMemo(() => {
		if (!product) return null;
		const p: any = product;
		const unitId = typeof p.unitId === "string" ? p.unitId.trim() : "";
		const unitName = typeof p.unitName === "string" ? p.unitName.trim() : "";
		const unitAbbreviation = typeof p.unitAbbreviation === "string" ? p.unitAbbreviation.trim() : "";

		const unitRef =
			p.unit && typeof p.unit === "object"
				? p.unit
				: unitId && unitById.has(unitId)
					? unitById.get(unitId)
					: unitName || unitAbbreviation
						? ((unitsQuery.data ?? []).find((unit) => {
								const nameMatch = unitName && unit.name.trim().toLowerCase() === unitName.trim().toLowerCase();
								const abbrMatch =
									unitAbbreviation && unit.abbreviation.trim().toLowerCase() === unitAbbreviation.trim().toLowerCase();
								return nameMatch || abbrMatch;
							}) ?? null)
						: null;

		if (!unitRef) return p;

		return {
			...p,
			unit: unitRef,
			unitId: unitRef.id ?? p.unitId,
			unitName: unitRef.name ?? p.unitName,
			unitAbbreviation: unitRef.abbreviation ?? p.unitAbbreviation,
			unitCategory: unitRef.category ?? p.unitCategory,
			unitPrecisionScale: unitRef.precisionScale ?? p.unitPrecisionScale,
		};
	}, [product, unitById, unitsQuery.data]);

	const categoryMetaById = useMemo(() => {
		const map = new Map<string, { isActive: boolean; color?: string | null }>();
		(categoriesQuery.data?.items ?? []).forEach((category) => {
			map.set(category.id, { isActive: category.isActive, color: category.color ?? null });
		});
		return map;
	}, [categoriesQuery.data?.items]);

	const categoryId = product?.category?.id ?? (product as any)?.categoryId ?? "";
	const fallbackCategoryIsActive = (product as any)?.category?.isActive;
	const fallbackCategoryColor = (product as any)?.category?.color ?? null;
	const categoryIsActive = useMemo(() => {
		if (categoryId && categoryMetaById.has(categoryId)) return categoryMetaById.get(categoryId)?.isActive;
		return fallbackCategoryIsActive;
	}, [categoryId, categoryMetaById, fallbackCategoryIsActive]);

	const categoryColor = useMemo(() => {
		if (categoryId && categoryMetaById.has(categoryId)) return categoryMetaById.get(categoryId)?.color ?? null;
		return fallbackCategoryColor;
	}, [categoryId, categoryMetaById, fallbackCategoryColor]);

	const meta = useMemo(() => {
		const rawCategoryName = (product as any)?.category?.name;
		const trimmedCategoryName = typeof rawCategoryName === "string" ? rawCategoryName.trim() : "";
		const normalizedCategoryName = trimmedCategoryName.toLowerCase();
		const hasCategory = trimmedCategoryName.length > 0 && normalizedCategoryName !== "none";
		const categoryName = hasCategory ? trimmedCategoryName : "None";

		const rawSku = (product as any)?.sku;
		const sku = typeof rawSku === "string" ? rawSku.trim() : "";
		const rawBarcode = (product as any)?.barcode;
		const barcode = typeof rawBarcode === "string" ? rawBarcode.trim() : "";

		return {
			categoryName,
			sku,
			barcode,
			hasCategory,
			categoryIsActive,
			hasSku: isMeaningfulDetailText(sku),
			hasBarcode: isMeaningfulDetailText(barcode),
		};
	}, [categoryIsActive, product]);

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;

	const categoryDotStyle = useMemo(() => {
		const fill = categoryColor ? categoryColor : "transparent";
		const stroke = categoryColor ? categoryColor : borderColor;
		return { backgroundColor: fill, borderColor: stroke };
	}, [borderColor, categoryColor]);

	const imageUri = useMemo(
		() => optimisticImageUri || toCacheBustedImageUri((product as any)?.primaryImageUrl, (product as any)?.updatedAt),
		[optimisticImageUri, product],
	);

	useEffect(() => {
		if (!incomingLocalImageUri) return;
		setOptimisticImageUri(incomingLocalImageUri);
		(router as any).setParams?.({ [LOCAL_URI_KEY]: undefined });
	}, [incomingLocalImageUri, router]);

	// Spinner/processing indication for RN Image
	const [isImageLoading, setIsImageLoading] = useState(false);
	const [imageLoadFailed, setImageLoadFailed] = useState(false);

	const rawTileMode = String((product as any)?.posTileMode ?? "")
		.trim()
		.toUpperCase();
	const hasRemoteTileImage = imageUri.length > 0;
	const tileMode =
		rawTileMode === "IMAGE" ? "IMAGE" : rawTileMode === "COLOR" ? "COLOR" : hasRemoteTileImage ? "IMAGE" : "COLOR";
	const selectedTileColor =
		typeof (product as any)?.posTileColor === "string" && (product as any).posTileColor.trim().length > 0
			? (product as any).posTileColor.trim()
			: null;
	const tileColor = selectedTileColor ?? "";
	const previewHasImage = tileMode === "IMAGE" && !!imageUri;
	const hasColor = tileMode === "COLOR" && !!selectedTileColor;
	const hasVisualTile = previewHasImage || hasColor;
	const shouldShowEmpty = !hasVisualTile;

	useEffect(() => {
		if (previewHasImage) {
			setIsImageLoading(true);
			setImageLoadFailed(false);
		} else {
			setIsImageLoading(false);
			setImageLoadFailed(false);
		}
	}, [previewHasImage]);
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
	const tileItemName = useMemo(() => {
		const raw = typeof (product as any)?.name === "string" ? (product as any).name : "";
		return sanitizeProductNameInput(raw).trim();
	}, [product]);
	const hasTileLabel = tileLabel.length > 0;
	const hasTileItemName = tileItemName.length > 0;
	const shouldShowTileTextOverlay = hasVisualTile && (hasTileLabel || hasTileItemName);
	const tileLabelColor = "#FFFFFF";

	const onImagePress = useCallback(() => {
		if (!productId) return;
		safePush(router, toScopedRoute(`/(app)/(tabs)/inventory/products/${encodeURIComponent(productId)}/photo`));
	}, [productId, router, safePush, toScopedRoute]);

	const onAdjustStock = useCallback(() => {
		if (!productId) return;
		router.push({
			pathname: toScopedRoute("/(app)/(tabs)/inventory/products/[id]/adjust") as any,
			params: { id: productId },
		});
	}, [productId, router, toScopedRoute]);

	const onEditItem = useCallback(() => {
		if (!productId) return;
		safePush(router, toScopedRoute(`/(app)/(tabs)/inventory/products/${encodeURIComponent(productId)}/edit`));
	}, [productId, router, safePush, toScopedRoute]);

	const onOpenOptionsVariations = useCallback(() => {
		if (!productId || !product || !canNavigate) return;

		const productOptionSelections = Array.isArray(product.optionSelections)
			? product.optionSelections
					.map((selection, idx) => ({
						optionSetId: String(selection?.optionSetId ?? "").trim(),
						optionSetName: String(selection?.optionSetName ?? "").trim(),
						selectedValueIds: Array.isArray(selection?.selectedValueIds)
							? selection.selectedValueIds.map((id) => String(id ?? "").trim()).filter(Boolean)
							: [],
						selectedValueNames: Array.isArray(selection?.selectedValueNames)
							? selection.selectedValueNames.map((name) => String(name ?? "").trim()).filter(Boolean)
							: [],
						sortOrder:
							typeof selection?.sortOrder === "number" && Number.isFinite(selection.sortOrder)
								? selection.sortOrder
								: idx,
					}))
					.filter((selection) => selection.optionSetId.length > 0)
			: [];

		const productVariations = Array.isArray(product.variations)
			? product.variations
					.map((variation, idx) => ({
						variationKey: String(variation?.variationKey ?? "").trim(),
						label: String(variation?.label ?? "").trim(),
						valueMap:
							variation?.valueMap && typeof variation.valueMap === "object"
								? Object.fromEntries(
										Object.entries(variation.valueMap).map(([setId, valueId]) => [
											String(setId ?? "").trim(),
											String(valueId ?? "").trim(),
										]),
								  )
								: {},
						sortOrder:
							typeof variation?.sortOrder === "number" && Number.isFinite(variation.sortOrder)
								? variation.sortOrder
								: idx,
					}))
					.filter((variation) => variation.variationKey.length > 0)
			: [];

		patchOptionsDraft({
			selectedOptionSetIds: productOptionSelections.map((selection) => selection.optionSetId),
			optionSelections: productOptionSelections,
			variations: productVariations,
			selectedVariationKeys: productVariations.map((variation) => variation.variationKey),
			variationSelectionInitialized: productVariations.length > 0,
		});

		router.replace({
			pathname: toScopedRoute(PRODUCT_SELECT_OPTIONS_ROUTE) as any,
			params: {
				[OPTION_DRAFT_ID_KEY]: optionsDraftId,
				[OPTION_RETURN_TO_KEY]: toScopedRoute(`/(app)/(tabs)/inventory/products/${encodeURIComponent(productId)}`),
				[PRODUCT_ID_KEY]: productId,
			} as any,
		});
	}, [canNavigate, optionsDraftId, patchOptionsDraft, product, productId, router, toScopedRoute]);

	const onArchiveItem = useCallback(() => {
		if (!productId || !product || product.isActive === false || busy.isBusy) return;
		setIsArchiveConfirmOpen(true);
	}, [busy.isBusy, product, productId]);

	const onRestoreItem = useCallback(() => {
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
		await withBusy("Archiving item...", async () => {
			try {
				await inventoryApi.archiveProduct(product.id);
				invalidateInventoryAfterMutation(queryClient, { productId });
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
					queryClient.invalidateQueries({ queryKey: ["pos", "catalog", "products"] }),
				]);
				setIsArchiveConfirmOpen(false);
				showSuccess("Item archived.");
			} catch (error) {
				showError(extractApiErrorMessage(error));
			}
		});
	}, [busy.isBusy, product, productId, queryClient, showError, showSuccess, withBusy]);

	const onConfirmRestore = useCallback(async () => {
		if (!product || product.isActive !== false || busy.isBusy) return;
		await withBusy("Restoring item...", async () => {
			try {
				await inventoryApi.restoreProduct(product.id);
				invalidateInventoryAfterMutation(queryClient, { productId });
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
					queryClient.invalidateQueries({ queryKey: ["pos", "catalog", "products"] }),
				]);
				setIsRestoreConfirmOpen(false);
				showSuccess("Item restored.");
			} catch (error) {
				showError(extractApiErrorMessage(error));
			}
		});
	}, [busy.isBusy, product, productId, queryClient, showError, showSuccess, withBusy]);

	const onCancel = onBackToInventory;

	const onViewAllActivity = useCallback(() => {
		if (!productId) return;
		router.push({
			pathname: toScopedRoute("/(app)/(tabs)/inventory/products/[id]/activity") as any,
			params: { id: productId },
		});
	}, [productId, router, toScopedRoute]);

	const onRetry = useCallback(() => {
		if (!productId) return;
		productDetailQuery.refetch();
		movementsQuery.refetch();
	}, [productId, productDetailQuery, movementsQuery]);

	const onRetryActivity = useCallback(() => {
		if (!productId) return;
		movementsQuery.refetch();
	}, [productId, movementsQuery]);

	const isLoading = productDetailQuery.isLoading || movementsQuery.isLoading;
	const isError = productDetailQuery.isError || movementsQuery.isError;
	const isArchived = product?.isActive === false;
	const canEditItem = !!productId && !!product && !isArchived;
	const variationCount = Array.isArray(product?.variations) ? product.variations.length : 0;
	const optionsVariationsButtonLabel = variationCount > 0 ? `Options & Variations (${variationCount})` : "Options & Variations";
	const canRestoreItem = !!productId && !!product && isArchived;
	const canArchiveItem = !!productId && !!product && !isArchived;
	const canPrimaryAction = isArchived ? canRestoreItem : canArchiveItem;

	const errorMessage = useMemo(() => {
		const msg1 = productDetailQuery.error ? extractApiErrorMessage(productDetailQuery.error) : "";
		const msg2 = movementsQuery.error ? extractApiErrorMessage(movementsQuery.error) : "";
		return msg1 || msg2 || "Failed to load item.";
	}, [productDetailQuery.error, movementsQuery.error]);

	const title = (product as any)?.name?.trim() ? (product as any).name : "Item";
	const productType = (product as any)?.type;
	const typeDisplay = useMemo(() => formatProductTypeLabel(productType), [productType]);

	const unitPrecisionScale = useMemo(
		() =>
			clampPrecisionScale(
				(productWithResolvedUnit as any)?.unitPrecisionScale ??
					(product as any)?.unitPrecisionScale ??
					(product as any)?.unit?.precisionScale,
			),
		[product, productWithResolvedUnit],
	);

	const onHandSummary = useMemo(() => {
		const source = productWithResolvedUnit ?? product;
		if (!source) return "—";
		return formatOnHand(source as any);
	}, [product, productWithResolvedUnit]);

	// ✅ UDQI: normalize movement deltas so InventoryMovementRow doesn’t misinterpret integer-decimals
	const movementsForDisplay = useMemo(() => {
		return movements.map((m) => {
			const anyM: any = m as any;
			const scale = unitPrecisionScale;

			const dec = typeof anyM?.quantityDeltaDecimal === "string" ? anyM.quantityDeltaDecimal.trim() : "";
			if (dec && /^-?\d+(\.\d+)?$/.test(dec)) {
				const normalized = formatDecimalRawWithScale(dec, scale);
				return normalized
					? ({ ...anyM, quantityDeltaRaw: normalized } as any)
					: ({ ...anyM, quantityDeltaRaw: dec } as any);
			}

			const raw = typeof anyM?.quantityDeltaRaw === "string" ? anyM.quantityDeltaRaw.trim() : "";
			if (raw) {
				if (/^-?\d+(\.\d+)?$/.test(raw) && raw.includes(".")) {
					const normalized = formatDecimalRawWithScale(raw, scale);
					return normalized
						? ({ ...anyM, quantityDeltaRaw: normalized } as any)
						: ({ ...anyM, quantityDeltaRaw: raw } as any);
				}
				return { ...anyM, quantityDeltaRaw: raw } as any;
			}

			const numeric =
				typeof anyM?.quantityDelta === "number" && Number.isFinite(anyM.quantityDelta) ? anyM.quantityDelta : null;
			if (numeric !== null) {
				const rawInt = String(Math.trunc(numeric));
				return { ...anyM, quantityDeltaRaw: formatScaledInt(rawInt, scale) } as any;
			}

			return m;
		});
	}, [movements, unitPrecisionScale]);

	const details = useMemo(() => {
		if (!productWithResolvedUnit) return [];
		const p: any = productWithResolvedUnit ?? {};
		const rows: { label: string; value: React.ReactNode }[] = [];

		const name = typeof p.name === "string" ? p.name.trim() : "";
		if (isMeaningfulDetailText(name)) rows.push({ label: "Name", value: name });

		const posTileNameRaw =
			typeof p.posTileName === "string"
				? p.posTileName
				: typeof p.posTileLabel === "string"
					? p.posTileLabel
					: typeof p.tileLabel === "string"
						? p.tileLabel
						: "";
		const posTileName = sanitizeLabelInput(posTileNameRaw).trim();
		if (isMeaningfulDetailText(posTileName)) rows.push({ label: "POS Tile Name", value: posTileName });

		if (typeof p.isActive === "boolean") rows.push({ label: "Status", value: p.isActive ? "Active" : "Archived" });

		if (isMeaningfulDetailText(p.description)) rows.push({ label: "Description", value: p.description.trim() });

		const unitTypeLabel = formatSelectedUnitLabel(p);
		if (unitTypeLabel && isMeaningfulDetailText(unitTypeLabel)) rows.push({ label: "Unit Type", value: unitTypeLabel });

		const unitCategoryLabel = formatUnitCategoryLabel(p.unitCategory);
		if (unitCategoryLabel) rows.push({ label: "Unit Category", value: unitCategoryLabel });

		const unitPrecisionLabel = formatPrecisionLabel(p.unitPrecisionScale);
		if (unitPrecisionLabel) rows.push({ label: "Precision", value: unitPrecisionLabel });

		const price = formatMoneyWithUnit(p.price ?? p.unitPrice ?? p.sellPrice, currencyCode, p);
		if (price && isMeaningfulDetailText(price)) rows.push({ label: "Price", value: price });

		const cost = formatMoneyWithUnit(p.cost ?? p.unitCost, currencyCode, p);
		if (cost && isMeaningfulDetailText(cost)) rows.push({ label: "Cost", value: cost });

		if (typeof p.trackInventory === "boolean")
			rows.push({ label: "Track Inventory", value: p.trackInventory ? "Yes" : "No" });

		const variationCount = Array.isArray(p.variations) ? p.variations.length : 0;
		rows.push({
			label: "Variations",
			value: variationCount > 0 ? `${variationCount} configured` : "None",
		});

		const optionSetCount = Array.isArray(p.optionSelections) ? p.optionSelections.length : 0;
		rows.push({
			label: "Option Sets",
			value: optionSetCount > 0 ? `${optionSetCount} selected` : "None",
		});

		// ✅ UDQI-CORRECT: reorder point uses the same resolved-mode formatter
		const reorderResolved = resolveQuantityDisplay(p, "reorder", unitPrecisionScale);
		const reorderBase = formatResolvedQuantity(reorderResolved, unitPrecisionScale);

		if (reorderBase && isMeaningfulDetailText(reorderBase)) {
			const reorderUnitToken = unitDisplayToken(p, "quantity", reorderResolved.value ?? undefined);
			const reorderValue = reorderUnitToken ? `${reorderBase} ${reorderUnitToken}` : reorderBase;
			rows.push({ label: "Reorder Point", value: reorderValue });
		}

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
	}, [currencyCode, productWithResolvedUnit, unitPrecisionScale]);

	const typeLabel = useMemo(() => (typeDisplay ? typeDisplay : ""), [typeDisplay]);
	const showDetails = details.length > 0;

	const metaRows = useMemo(
		() =>
			[
				typeLabel ? { label: "Type", value: typeLabel } : null,
				{ label: "On Hand", value: onHandSummary },
				{
					label: "Category",
					value: (
						<View style={styles.metaInline}>
							{meta.hasCategory ? <View style={[styles.categoryDot, categoryDotStyle]} /> : null}
							<BAIText variant='body' numberOfLines={1} ellipsizeMode='tail' style={styles.metaValueText}>
								{meta.categoryName}
							</BAIText>
						</View>
					),
				},
				meta.hasSku ? { label: "SKU", value: meta.sku } : null,
				meta.hasBarcode ? { label: "Barcode", value: meta.barcode } : null,
			].filter(Boolean) as { label: string; value: React.ReactNode }[],
		[
			categoryDotStyle,
			meta.categoryName,
			meta.hasBarcode,
			meta.hasCategory,
			meta.hasSku,
			meta.barcode,
			meta.sku,
			onHandSummary,
			typeLabel,
		],
	);

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
						<Pressable
							key={(m as any).id}
							disabled={!canOpen}
							onPress={() => {
								if (!mid) return;
								router.push({
									pathname: toScopedRoute("/(app)/(tabs)/inventory/products/[id]/activity/[movementId]") as any,
									params: { id: productId, movementId: mid },
								});
							}}
							accessibilityRole='button'
							accessibilityLabel='View activity details'
							style={({ pressed }) => [styles.movementPressable, pressed && canOpen ? styles.pressed : null]}
						>
							<InventoryMovementRow
								movement={m}
								showDateTime
								precisionScale={unitPrecisionScale}
								unit={productWithResolvedUnit ?? product}
							/>
						</Pressable>
					);
				})}
			</View>
		);
	})();

	return (
		<>
			<Stack.Screen options={headerOptions} />

			<BAIScreen
				padded={false}
				tabbed
				safeTop={false}
				safeBottom={false}
				style={styles.root}
				contentContainerStyle={[styles.screen, { paddingBottom: tabBarHeight + 12 }]}
			>
				<BAISurface style={[styles.card, { borderColor }]} padded={false}>
					{!isLoading && !isError ? (
						<View style={[styles.cardHeader, { borderBottomColor: borderColor }]}>
							<BAIText variant='title'>Item Details</BAIText>
						</View>
					) : null}

					<ScrollView
						style={styles.cardScroll}
						contentContainerStyle={styles.cardScrollContent}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps='handled'
					>
						{isLoading ? (
							<View style={styles.center}>
								<BAIActivityIndicator />
							</View>
						) : isError ? (
							<View style={styles.center}>
								{typeLabel ? (
									<BAIText variant='caption' muted style={styles.typeLabel}>
										Type: {typeLabel}
									</BAIText>
								) : null}

								<BAIText variant='title' numberOfLines={1} ellipsizeMode='tail' style={styles.title}>
									{title}
								</BAIText>

								<BAIText variant='body' muted style={{ marginTop: 8, textAlign: "center" }}>
									{errorMessage}
								</BAIText>

								<View style={styles.actions}>
									<BAIRetryButton mode='contained' onPress={onRetry} disabled={!productId}>
										Retry
									</BAIRetryButton>
								</View>
							</View>
						) : (
							<>
								<View style={styles.imageHeaderRow}>
									<View
										style={[
											styles.imagePreview,
											{
												borderColor,
												backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
											},
										]}
									>
										{previewHasImage ? (
											<View style={styles.imageFill}>
												<Image
													source={{ uri: imageUri }}
													style={styles.imagePreviewImage}
													resizeMode='cover'
													onLoadStart={() => {
														setIsImageLoading(true);
														setImageLoadFailed(false);
													}}
													onLoadEnd={() => setIsImageLoading(false)}
													onError={() => {
														setIsImageLoading(false);
														setImageLoadFailed(true);
													}}
												/>

												{isImageLoading ? (
													<View style={styles.imageLoadingOverlay} pointerEvents='none'>
														<BAIActivityIndicator />
													</View>
												) : null}

												{imageLoadFailed ? (
													<View style={styles.imageLoadingOverlay} pointerEvents='none'>
														<FontAwesome6
															name='image'
															size={48}
															color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
														/>
														<View style={{ height: 6 }} />
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
												<PosTileTextOverlay label={tileLabel} name={tileItemName} textColor={tileLabelColor} />
											) : null}
									</View>
									{!isArchived ? (
										<View style={styles.imageActionColumn}>
											<BAIIconButton
												variant='outlined'
												size='md'
												icon='camera'
												iconSize={34}
												accessibilityLabel='Edit image'
												onPress={onImagePress}
												disabled={!canNavigate || isLoading}
												style={styles.imageEditButtonOutside}
											/>
										</View>
									) : null}
								</View>

								<View style={styles.header}>
									<View style={styles.headerLeft}>
										<BAIText variant='title' numberOfLines={1} ellipsizeMode='tail' style={styles.title}>
											{title}
										</BAIText>
										<BAIText variant='caption' muted numberOfLines={1} style={styles.headerSub}>
											Status:{" "}
											{typeof (product as any)?.isActive === "boolean"
												? (product as any).isActive
													? "Active"
													: "Archived"
												: "—"}
										</BAIText>
									</View>
								</View>

								<View
									style={[
										styles.metaPanel,
										{ borderColor, backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface },
									]}
								>
									{metaRows.map((row, index) => (
										<MetaRow
											key={`${row.label}-${index}`}
											label={row.label}
											value={row.value}
											divider={index < metaRows.length - 1}
											dividerColor={borderColor}
										/>
									))}
								</View>

								{!isArchived ? (
									<View style={[styles.itemFooterActions, styles.topActionsContainer]}>
										<BAICTAPillButton
											variant='outline'
											intent='primary'
											onPress={onEditItem}
											disabled={!canEditItem || !canNavigate || isLoading}
											style={styles.footerActionButton}
										>
											Edit Item
										</BAICTAPillButton>
										<BAICTAPillButton
											variant='solid'
											onPress={onAdjustStock}
											disabled={!productId}
											style={styles.footerActionButton}
										>
											Adjust Stock
										</BAICTAPillButton>
									</View>
								) : null}

								{!isArchived ? (
									<View style={[styles.itemFooterActions, styles.topActionsSecondaryContainer]}>
										<BAICTAPillButton
											variant='outline'
											intent='neutral'
											onPress={onOpenOptionsVariations}
											disabled={!canEditItem || !canNavigate || isLoading}
											style={styles.footerActionButton}
										>
											{optionsVariationsButtonLabel}
										</BAICTAPillButton>
									</View>
								) : null}

								{showDetails ? (
									<>
										<View style={styles.detailsSectionContainerPadding}>
											<View
												style={[
													styles.detailsSecondaryContainer,
													{ borderColor, backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface },
												]}
											>
												<View style={[styles.sectionHeader, { borderBottomColor: borderColor }]}>
													<BAIText variant='subtitle'>Details</BAIText>
												</View>
												<View style={styles.sectionBody}>
													<View style={styles.detailsGridTight}>
														{details.map((r, index) => (
															<DetailRow
																key={`${r.label}:${String(r.value)}`}
																label={r.label}
																value={r.value}
																isLast={index === details.length - 1}
															/>
														))}
													</View>
												</View>
											</View>
										</View>
									</>
								) : null}

								<View style={styles.recentSectionContainerPadding}>
									<View
										style={[
											styles.detailsSecondaryContainer,
											{ borderColor, backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface },
										]}
									>
										<View style={[styles.sectionHeader, { borderBottomColor: borderColor }]}>
											<View style={styles.sectionHeaderText}>
												<BAIText variant='subtitle'>Recent Activity</BAIText>
												<BAIText variant='caption' muted>
													Last 5 Movements
												</BAIText>
											</View>
											<BAIButton
												variant='outline'
												intent='neutral'
												size='sm'
												onPress={onViewAllActivity}
												disabled={!productId}
												style={styles.sectionHeaderAction}
												widthPreset='standard'
											>
												View All
											</BAIButton>
										</View>

										<View style={styles.sectionBody}>{activityContent}</View>
									</View>
								</View>

								<View style={[styles.itemFooterActions, styles.bottomActionsContainer]}>
									{isArchived ? (
										<>
											<BAICTAPillButton
												variant='outline'
												intent='neutral'
												onPress={onCancel}
												disabled={!canNavigate || isLoading}
												style={styles.footerActionButton}
											>
												Cancel
											</BAICTAPillButton>
											<BAICTAPillButton
												variant='solid'
												intent='primary'
												onPress={onRestoreItem}
												disabled={!canPrimaryAction || !canNavigate || isLoading}
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
												onPress={onArchiveItem}
												disabled={!canPrimaryAction || !canNavigate || isLoading}
												style={styles.footerActionButton}
											>
												Archive
											</BAICTAPillButton>
											<BAICTAPillButton
												variant='outline'
												intent='neutral'
												onPress={onCancel}
												disabled={!canNavigate || isLoading}
												style={styles.footerActionButton}
											>
												Cancel
											</BAICTAPillButton>
										</>
									)}
								</View>
							</>
						)}
					</ScrollView>
				</BAISurface>
				<BAIConfirmArchiveModal
					visible={isArchiveConfirmOpen}
					entityLabel='item'
					entityName={product?.name}
					description='Archived items stay in historical records and are removed from active inventory lists.'
					onDismiss={closeArchiveConfirm}
					onConfirm={onConfirmArchive}
					disabled={busy.isBusy}
				/>
				<BAIConfirmRestoreModal
					visible={isRestoreConfirmOpen}
					entityLabel='item'
					entityName={product?.name}
					description='Restored items return to active inventory lists.'
					onDismiss={closeRestoreConfirm}
					onConfirm={onConfirmRestore}
					disabled={busy.isBusy}
				/>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	screen: { flex: 1, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 0 },
	card: {
		flex: 1,
		minHeight: 0,
		borderWidth: 1,
		borderRadius: 24,
		gap: 6,
		overflow: "hidden",
		paddingHorizontal: 0,
		paddingTop: 12,
		paddingBottom: 12,
	},
	cardScroll: { flex: 1 },
	cardScrollContent: { paddingBottom: 4 },
	cardHeader: {
		paddingHorizontal: 14,
		paddingBottom: 10,
		marginBottom: 0,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	center: { padding: 16, alignItems: "center", justifyContent: "center" },

	imageHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 16,
		marginBottom: 16,
	},
	imageActionColumn: {
		alignItems: "center",
		gap: 20,
	},
	imageEditButtonOutside: {
		width: 60,
		height: 60,
		borderRadius: 30,
	},
	itemFooterActions: {
		marginTop: 16,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	topActionsContainer: {
		paddingHorizontal: 12,
		paddingBottom: 12,
	},
	topActionsSecondaryContainer: {
		paddingHorizontal: 12,
		paddingTop: 0,
		paddingBottom: 12,
	},
	bottomActionsContainer: {
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	footerActionButton: {
		flex: 1,
	},
	imagePreview: {
		width: 180,
		aspectRatio: 1,
		borderRadius: 18,
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
	imagePreviewEmpty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	tileLabelWrap: {
		position: "absolute",
		left: 2,
		right: 2,
		bottom: 2,
		borderRadius: 16,
		overflow: "hidden",
		minHeight: 80,
	},
	tileLabelOverlay: {
		...StyleSheet.absoluteFillObject,
	},
	tileLabelContent: {
		paddingHorizontal: 10,
		paddingTop: 6,
		paddingBottom: 6,
		justifyContent: "flex-start",
		gap: 2,
	},
	tileNameOnlyContent: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		minHeight: 32,
		paddingHorizontal: 10,
		paddingVertical: 6,
		justifyContent: "center",
	},
	tileLabelRow: {
		minHeight: 36,
		justifyContent: "flex-end",
	},
	tileNameRow: {
		minHeight: 20,
		justifyContent: "flex-start",
	},
	tileNamePill: {
		alignSelf: "stretch",
		width: "100%",
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	tileLabelText: {
		fontWeight: "700",
		fontSize: 30,
	},
	tileItemName: {
		marginTop: 0,
		fontSize: 18,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingHorizontal: 12,
	},
	headerLeft: { flex: 1, minWidth: 0, gap: 6 },
	headerSub: { opacity: 0.9 },

	metaPanel: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		overflow: "hidden",
		marginTop: 12,
		marginHorizontal: 12,
	},
	metaRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
	metaRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
	metaLabel: { width: 88 },
	metaValueCol: { flex: 1, minWidth: 0 },
	metaValueText: { flexShrink: 1 },
	metaInline: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },

	categoryDot: { width: 12, height: 12, borderRadius: 9, borderWidth: 1 },

	typeLabel: { marginTop: 4 },
	title: { flexShrink: 1 },

	actions: { marginTop: 12, flexDirection: "row", gap: 10 },

	sectionHeader: {
		paddingHorizontal: 12,
		paddingVertical: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	sectionHeaderText: { flex: 1, minWidth: 0, gap: 2 },
	sectionHeaderAction: { marginLeft: 8 },
	detailsSectionContainerPadding: {
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	recentSectionContainerPadding: {
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	detailsSecondaryContainer: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		overflow: "hidden",
	},

	sectionBody: { padding: 12 },

	emptyState: { paddingVertical: 6 },
	detailsGridTight: { gap: 0 },

	detailRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
	detailLabel: { textTransform: "none", letterSpacing: 0, minWidth: 110, maxWidth: 130, flexShrink: 0 },
	detailValue: { flex: 1, lineHeight: 18 },
	detailValueRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, flex: 1 },

	inlineSep: { marginHorizontal: 4 },
	timestampRow: { flexDirection: "row", alignItems: "center", flexWrap: "nowrap", gap: 4, flex: 1 },
	timestampValue: { flex: 0, flexShrink: 1 },
	timestampAgo: { flexShrink: 0 },

	movementList: { gap: 6 },
	movementPressable: { borderRadius: 12, overflow: "hidden" },
	pressed: { opacity: 0.82 },
});
