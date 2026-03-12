// BizAssist_mobile
// path: src/modules/inventory/screens/InventoryProductAdjustScreen.tsx
//
// Fixes (locked):
// 1) Unit precision must resolve from product detail even if it ships as `Unit` (capital U).
// 2) Apply must not be disabled by JS Number overflow (no Number-based gating).
// 3) UDQI FINAL: Hard cap 18 chars, blur now pads to unit precision, submit-time normalization.
// 4) ✅ MIN SAFE FIX (this patch): enforce UDQI integer-digit cap to prevent DB numeric overflow (Prisma P2020).
//
// ✅ CHANGE (this patch):
// - Quantity keyboard must be numeric with a decimal point (same feel as Create Item “Initial on hand”).
// - So we use `decimal-pad` when precisionScale > 0, else `number-pad`, regardless of reason.
//
// Navigation governance:
// - Screen class: PROCESS.
// - Header-left uses Exit (X) for cancel intent.
// - Exit is deterministic (replace) to item detail, with optional returnTo override.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Image,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	TouchableWithoutFeedback,
	View,
	type KeyboardEvent,
	type LayoutChangeEvent,
	type LayoutRectangle,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { useTheme } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesome6 } from "@expo/vector-icons";

import { useAppBusy } from "@/hooks/useAppBusy";
import { toCacheBustedImageUri } from "@/modules/media/media.image";

import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAITextInput } from "@/components/ui/BAITextInput";
import { BAICTAPillButton } from "@/components/ui/BAICTAButton";
import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";

import { inventoryApi } from "@/modules/inventory/inventory.api";
import { makeIdempotencyKey } from "@/modules/inventory/inventory.utils";
import { toInventoryDomainError, mapInventoryErrorToMessage } from "@/modules/inventory/inventory.errors";
import { invalidateInventoryAfterMutation } from "@/modules/inventory/inventory.invalidate";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import { formatOnHand } from "@/modules/inventory/inventory.selectors";
import { runGovernedProcessExit } from "@/modules/inventory/navigation.governance";
import {
	inventoryScopeRoot,
	mapInventoryRouteToScope,
	type InventoryRouteScope,
} from "@/modules/inventory/navigation.scope";
import { useInventoryHeader } from "@/modules/inventory/useInventoryHeader";
import { useProcessExitGuard } from "@/modules/navigation/useProcessExitGuard";
import { patchPosCatalogOnHandCaches } from "@/modules/pos/pos.catalog.cache";
import { unitDisplayToken } from "@/modules/units/units.format";
import { categoriesApi } from "@/modules/categories/categories.api";
import { categoryKeys } from "@/modules/categories/categories.queries";

import type { InventoryMovementReason, InventoryProductDetail } from "@/modules/inventory/inventory.types";
import type { Category } from "@/modules/categories/categories.types";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import { sanitizeNoteInput } from "@/shared/validation/sanitize";

type Params = { id?: string; returnTo?: string };

const REASONS: { label: string; value: InventoryMovementReason; helper: string }[] = [
	{ label: "Stock In", value: "STOCK_IN", helper: "Increase on-hand quantity." },
	{ label: "Stock Out", value: "STOCK_OUT", helper: "Decrease on-hand quantity." },
	{ label: "Adjustment", value: "ADJUSTMENT", helper: "Apply a signed correction (+/-) to fix inventory." },
];

// UDQI caps
const HARD_QTY_CAP = 18;
const UDQI_INT_MAX_DIGITS = 12;

function getReasonLabel(reason: InventoryMovementReason) {
	return REASONS.find((r) => r.value === reason)?.label ?? "Adjustment";
}

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}

function capText(raw: string, maxLen: number) {
	if (maxLen <= 0) return "";
	return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
}

function sanitizeNote(raw: string, maxLen: number) {
	return capText(sanitizeNoteInput(raw), maxLen);
}

function clampPrecisionScale(n: unknown): number {
	const x = typeof n === "number" ? n : Number(n);
	if (!Number.isFinite(x)) return 0;
	return Math.max(0, Math.min(5, Math.trunc(x)));
}

/**
 * UDQI typing sanitize:
 * - digits + optional single dot
 * - optional single leading '-' ONLY when allowNegative
 * - clamp fractional digits to `scale`
 * - no commas, no scientific notation, no whitespace
 * - allows "10." during typing (submit blocks trailing '.')
 *
 * NOTE: This function does NOT cap integer digits. That is done by enforceUdiqCaps() below.
 */
function sanitizeQuantityInput(raw: string, scale: number, allowNegative: boolean) {
	let s = String(raw ?? "")
		.replace(/,/g, "")
		.trim();
	if (!s) return "";

	if (allowNegative) {
		s = s.replace(/[^0-9.\-]/g, "").replace(/(?!^)-/g, "");
	} else {
		s = s.replace(/[^0-9.]/g, "");
	}

	// allow only one '.'
	const firstDot = s.indexOf(".");
	if (firstDot >= 0) {
		const before = s.slice(0, firstDot + 1);
		const after = s.slice(firstDot + 1).replace(/\./g, "");
		s = before + after;
	}

	// if scale is 0, strip dots entirely
	if (scale <= 0) {
		return s.replace(/\./g, "");
	}

	// clamp fractional length to scale
	if (s.includes(".")) {
		const neg = s.startsWith("-");
		const body = neg ? s.slice(1) : s;
		const [intPart, fracPart = ""] = body.split(".");
		const clampedFrac = fracPart.slice(0, Math.max(0, Math.trunc(scale)));
		s = (neg ? "-" : "") + intPart + "." + clampedFrac;
	}

	return s;
}

/**
 * ✅ MIN SAFE FIX:
 * Enforce UDQI integer digit cap (12) + scale fractional cap, without changing “natural typing”.
 * This prevents sending numbers that overflow DB NUMERIC precision (Prisma P2020).
 *
 * Rules:
 * - Keep optional leading '-' (only if allowNegative).
 * - Keep at most 1 '.' (already ensured by sanitizeQuantityInput).
 * - Cap integer digits to UDQI_INT_MAX_DIGITS.
 * - Cap fractional digits to `scale`.
 * - Keep overall hard cap (HARD_QTY_CAP) as final safety net.
 */
function enforceUdiqCaps(sanitized: string, scale: number, allowNegative: boolean, hardCap: number) {
	let s = String(sanitized ?? "");
	if (!s) return "";

	const neg = allowNegative && s.startsWith("-");
	const body = neg ? s.slice(1) : s;

	if (scale <= 0) {
		// whole number only
		const intOnly = body.replace(/\./g, "");
		const cappedInt = intOnly.slice(0, UDQI_INT_MAX_DIGITS);
		const out = (neg ? "-" : "") + cappedInt;
		return capText(out, hardCap);
	}

	if (body.includes(".")) {
		const [intPartRaw, fracRaw = ""] = body.split(".");
		const intPart = intPartRaw.slice(0, UDQI_INT_MAX_DIGITS);
		const frac = fracRaw.slice(0, Math.max(0, Math.trunc(scale)));
		const out = (neg ? "-" : "") + intPart + "." + frac;
		return capText(out, hardCap);
	}

	// no dot: integer typing
	const intPart = body.slice(0, UDQI_INT_MAX_DIGITS);
	const out = (neg ? "-" : "") + intPart;
	return capText(out, hardCap);
}

function isValidDecimalString(raw: string, scale: number, allowNegative: boolean) {
	const s = raw.trim();
	if (!s) return false;

	// allow trailing dot while typing; submit blocks it
	const re = allowNegative ? /^-?\d+(\.\d*)?$/ : /^\d+(\.\d*)?$/;
	if (!re.test(s)) return false;

	const parts = s.split(".");
	const frac = parts[1] ?? "";
	if (frac.length > scale) return false;

	return true;
}

/**
 * Submit-time normalization:
 * - Reject empty, "-", trailing dot, scientific notation, commas
 * - Right-pad zeros to `scale` (fixed-scale decimal string)
 */
function normalizeQuantityForSubmit(
	raw: string,
	scale: number,
	allowNegative: boolean,
): { ok: true; value: string } | { ok: false; message: string } {
	const s0 = String(raw ?? "").trim();
	if (!s0) return { ok: false, message: "Enter a quantity." };
	if (s0 === "-") return { ok: false, message: "Enter a quantity." };
	if (/[eE,]/.test(s0)) return { ok: false, message: "Invalid number format." };

	const re = allowNegative ? /^-?\d+(\.\d*)?$/ : /^\d+(\.\d*)?$/;
	if (!re.test(s0)) return { ok: false, message: "Enter a valid quantity." };
	if (s0.endsWith(".")) return { ok: false, message: "Quantity cannot end with a decimal point." };

	const sc = Math.max(0, Math.trunc(Number(scale) || 0));

	if (sc <= 0) {
		// whole number only (no dot)
		return { ok: true, value: s0.replace(/\./g, "") };
	}

	const neg = allowNegative && s0.startsWith("-");
	const body = neg ? s0.slice(1) : s0;

	const [intRaw, fracRaw = ""] = body.split(".");
	if (fracRaw.length > sc) return { ok: false, message: `Max ${sc} decimals for this unit.` };

	const intPart = intRaw.length ? intRaw : "0";
	const frac = (fracRaw + "0".repeat(sc)).slice(0, sc);

	return { ok: true, value: `${neg ? "-" : ""}${intPart}.${frac}` };
}

function normalizeQuantityForBlur(raw: string, scale: number, allowNegative: boolean, hardCap: number) {
	const sanitized = sanitizeQuantityInput(raw, scale, allowNegative);
	const capped = enforceUdiqCaps(sanitized, scale, allowNegative, hardCap);

	const trimmed = capped.trim();
	if (!trimmed || trimmed === "." || trimmed === "-" || trimmed === "-.") return "";

	const normalized = normalizeQuantityForSubmit(capped, scale, allowNegative);
	if (!normalized.ok) return capped;

	return normalized.value;
}

function toScaledBigInt(raw: string, scale: number): bigint {
	// raw matches /^-?\d+(\.\d+)?$/ (no trailing dot)
	const s = raw.trim();
	const neg = s.startsWith("-");
	const body = neg ? s.slice(1) : s;
	const [intPartRaw, fracPartRaw = ""] = body.split(".");

	const intPart = intPartRaw.replace(/^0+(?=\d)/, "") || "0";
	const frac = (fracPartRaw + "0".repeat(scale)).slice(0, scale);
	const digits = (intPart + frac).replace(/^0+(?=\d)/, "") || "0";
	const bi = BigInt(digits);
	return neg ? -bi : bi;
}

function computeDeltaScaled(reason: InventoryMovementReason, qtyScaled: bigint): bigint {
	if (qtyScaled === 0n) return 0n;
	if (reason === "STOCK_IN") return qtyScaled < 0n ? -qtyScaled : qtyScaled;
	if (reason === "STOCK_OUT") {
		const mag = qtyScaled < 0n ? -qtyScaled : qtyScaled;
		return mag === 0n ? 0n : -mag;
	}
	return qtyScaled; // ADJUSTMENT keeps sign
}

function formatScaledInt(v: unknown, scale: number): string {
	if (v == null) return "—";
	const s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.trunc(v)) : "") : String(v);
	if (!s) return "—";
	if (!/^-?\d+$/.test(s.trim())) return s;

	const neg = s.trim().startsWith("-");
	const digits = neg ? s.trim().slice(1) : s.trim();
	if (scale <= 0) return (neg ? "-" : "") + (digits || "0");

	const padded = digits.padStart(scale + 1, "0");
	const intPart = padded.slice(0, -scale) || "0";
	const fracPart = padded.slice(-scale);
	return (neg ? "-" : "") + intPart + "." + fracPart;
}

function formatScaledBigInt(v: bigint, scale: number): string {
	const neg = v < 0n;
	const mag = neg ? -v : v;
	const digits = mag.toString();
	if (scale <= 0) return (neg ? "-" : "") + digits;
	const padded = digits.padStart(scale + 1, "0");
	const intPart = padded.slice(0, -scale) || "0";
	const fracPart = padded.slice(-scale);
	return (neg ? "-" : "") + intPart + "." + fracPart;
}

function buildPrecisionHelperText(scale: number, unitToken?: string) {
	const token = (unitToken ?? "").trim();
	const suffix = token ? ` for ${token}` : "";
	if (scale <= 0) return `Whole numbers only${suffix}.`;
	if (scale === 1) return `Up to 1 decimal place${suffix}.`;
	return `Up to ${scale} decimal places${suffix}.`;
}

function buildZeroPlaceholder(scale: number) {
	const sc = Math.max(0, Math.trunc(Number(scale) || 0));
	if (sc <= 0) return "0";
	return "0." + "0".repeat(sc);
}

function RadioMark({ selected, color, borderColor }: { selected: boolean; color: string; borderColor: string }) {
	return (
		<View style={[styles.radioOuter, { borderColor }]}>
			{selected ? <View style={[styles.radioInner, { backgroundColor: color }]} /> : null}
		</View>
	);
}

function ReasonRow({
	label,
	helper,
	selected,
	onPress,
	divider,
	borderColor,
	activeColor,
	disabled,
}: {
	label: string;
	helper?: string;
	selected: boolean;
	onPress: () => void;
	divider?: boolean;
	borderColor: string;
	activeColor: string;
	disabled?: boolean;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={!!disabled}
			style={({ pressed }) => [
				styles.reasonRowItem,
				divider ? [styles.reasonRowDivider, { borderBottomColor: borderColor }] : null,
				pressed && !disabled ? { opacity: 0.9 } : null,
			]}
		>
			<View style={styles.reasonRowLeft}>
				<BAIText variant='body' style={styles.reasonRowLabel}>
					{label}
				</BAIText>
				{helper ? (
					<BAIText variant='caption' muted numberOfLines={2} style={styles.reasonRowHelper}>
						{helper}
					</BAIText>
				) : null}
			</View>
			<RadioMark selected={selected} color={activeColor} borderColor={borderColor} />
		</Pressable>
	);
}

export default function InventoryProductAdjustScreen({
	routeScope = "inventory",
}: {
	routeScope?: InventoryRouteScope;
}) {
	const theme = useTheme();
	const router = useRouter();
	const qc = useQueryClient();
	const { withBusy, busy } = useAppBusy();
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const rootRoute = useMemo(() => inventoryScopeRoot(routeScope), [routeScope]);
	const isBusy = !!busy?.isBusy;
	const headerHeight = useHeaderHeight();

	const scrollRef = useRef<ScrollView>(null);
	const noteLayoutRef = useRef<LayoutRectangle | null>(null);

	const params = useLocalSearchParams<Params>();
	const productId = useMemo(() => (params.id ?? "").trim(), [params.id]);
	const rawReturnTo = params.returnTo;
	const enabled = !!productId;
	const detailRoute = useMemo(
		() => (productId ? toScopedRoute(`/(app)/(tabs)/inventory/products/${encodeURIComponent(productId)}`) : rootRoute),
		[productId, rootRoute, toScopedRoute],
	);

	// Header governance: PROCESS -> Exit (deterministic replace).
	const onExit = useCallback(() => {
		runGovernedProcessExit(rawReturnTo, detailRoute, {
			router: router as any,
			disabled: isBusy,
		});
	}, [detailRoute, isBusy, rawReturnTo, router]);
	const guardedOnExit = useProcessExitGuard(onExit);

	const headerOptions = useInventoryHeader("process", {
		title: "Adjust Stock",
		disabled: isBusy,
		onExit: guardedOnExit,
		exitFallbackRoute: detailRoute,
	});

	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const [viewportH, setViewportH] = useState(0);
	const scrollYRef = useRef(0);

	useEffect(() => {
		const onShow = (e: KeyboardEvent) => setKeyboardHeight(e?.endCoordinates?.height ?? 0);
		const onHide = () => setKeyboardHeight(0);

		const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
		const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

		const subShow = Keyboard.addListener(showEvt as any, onShow as any);
		const subHide = Keyboard.addListener(hideEvt as any, onHide);

		return () => {
			subShow.remove();
			subHide.remove();
		};
	}, []);

	const productDetailQuery = useQuery<InventoryProductDetail>({
		queryKey: inventoryKeys.productDetail(productId),
		queryFn: () => inventoryApi.getProductDetail(productId),
		enabled,
		staleTime: 30_000,
	});

	const categoriesQuery = useQuery<{ items: Category[] }>({
		queryKey: categoryKeys.list({ limit: 250 }),
		queryFn: () => categoriesApi.list({ limit: 250 }),
		staleTime: 30_000,
	});

	const product = productDetailQuery.data ?? null;

	const categoryStatusById = useMemo(() => {
		const map = new Map<string, boolean>();
		(categoriesQuery.data?.items ?? []).forEach((category) => map.set(category.id, category.isActive));
		return map;
	}, [categoriesQuery.data?.items]);

	const [reason, setReason] = useState<InventoryMovementReason>("ADJUSTMENT");
	const [qtyText, setQtyText] = useState("");
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);

	// ✅ MIN SAFE FIX: product detail may ship unit as `Unit` (capital U) instead of `unit`.
	const resolvedUnit = useMemo(() => {
		const p = product as any;
		return p?.unit ?? p?.Unit ?? null;
	}, [product]);

	const productForUnit = useMemo(() => {
		const p = product as any;
		if (!p) return p;
		if (p.unit) return p;
		if (!resolvedUnit) return p;
		return { ...p, unit: resolvedUnit };
	}, [product, resolvedUnit]);

	const unitPrecision = useMemo(() => {
		const p = product as any;
		return clampPrecisionScale(
			p?.unitPrecisionScale ?? p?.unit?.precisionScale ?? p?.Unit?.precisionScale ?? resolvedUnit?.precisionScale ?? 0,
		);
	}, [product, resolvedUnit]);

	const allowNegative = reason === "ADJUSTMENT";
	const qtyMaxLen = HARD_QTY_CAP;

	const quantityUnitToken = useMemo(() => unitDisplayToken(productForUnit, "quantity") ?? undefined, [productForUnit]);
	const precisionHelperText = useMemo(
		() => buildPrecisionHelperText(unitPrecision, quantityUnitToken),
		[quantityUnitToken, unitPrecision],
	);

	// ✅ CHANGE: match Create Item keyboard behavior (numeric + decimal point when scale>0).
	// This avoids iOS “numbers-and-punctuation” and ensures a decimal-key keypad.
	const quantityKeyboardType = useMemo(() => {
		return unitPrecision > 0 ? ("decimal-pad" as const) : ("number-pad" as const);
	}, [unitPrecision]);

	const qtySanitized = useMemo(() => {
		// Keep state deterministic if pasted/edited in strange ways
		const v0 = sanitizeQuantityInput(qtyText, unitPrecision, allowNegative);
		const v1 = enforceUdiqCaps(v0, unitPrecision, allowNegative, qtyMaxLen);
		return v1;
	}, [allowNegative, qtyMaxLen, qtyText, unitPrecision]);

	useEffect(() => {
		if (qtyText !== qtySanitized) setQtyText(qtySanitized);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [qtySanitized]);

	const qtyIsValidTyping = useMemo(() => {
		if (!qtySanitized) return false;
		return isValidDecimalString(qtySanitized, unitPrecision, allowNegative);
	}, [allowNegative, qtySanitized, unitPrecision]);

	// Compute deltaScaled without Number conversions; do not accept trailing dot.
	const deltaScaled = useMemo(() => {
		if (!qtyIsValidTyping) return 0n;
		const s = qtySanitized.trim();
		if (!s || s === "-" || s.endsWith(".")) return 0n;

		try {
			const normalized = normalizeQuantityForSubmit(s, unitPrecision, allowNegative);
			if (!normalized.ok) return 0n;
			const qtyScaled = toScaledBigInt(normalized.value, unitPrecision);
			return computeDeltaScaled(reason, qtyScaled);
		} catch {
			return 0n;
		}
	}, [allowNegative, qtyIsValidTyping, qtySanitized, reason, unitPrecision]);

	const canCheckStock = product?.trackInventory === true;

	const onHandScaledLegacy = (product as any)?.onHandCached ?? 0;
	const onHandRawDecimal = (product as any)?.onHandCachedRaw ?? null;

	const onHandTreatAsMajor = useMemo(() => {
		const raw = typeof onHandRawDecimal === "string" ? onHandRawDecimal.trim() : "";
		if (raw) return true;

		if (unitPrecision <= 0) return false;

		const n =
			typeof onHandScaledLegacy === "number"
				? onHandScaledLegacy
				: typeof onHandScaledLegacy === "string"
					? Number(onHandScaledLegacy)
					: Number(String(onHandScaledLegacy ?? "0"));

		if (!Number.isFinite(n)) return false;

		const abs = Math.abs(n);
		if (abs === 0) return false;

		const threshold = Math.pow(10, unitPrecision);
		return abs < threshold;
	}, [onHandRawDecimal, onHandScaledLegacy, unitPrecision]);

	const onHandDisplay = useMemo(() => {
		const raw = typeof onHandRawDecimal === "string" ? onHandRawDecimal.trim() : "";
		if (raw) return raw;

		if (onHandTreatAsMajor) return String(onHandScaledLegacy ?? "0");

		return formatScaledInt(onHandScaledLegacy, unitPrecision);
	}, [onHandRawDecimal, onHandScaledLegacy, onHandTreatAsMajor, unitPrecision]);

	const onHandLabel = useMemo(() => {
		const productForOnHandLabel = {
			...(productForUnit as any),
			onHandCachedRaw: onHandDisplay,
		};
		return formatOnHand(productForOnHandLabel);
	}, [onHandDisplay, productForUnit]);

	const onHandScaledForCompare = useMemo(() => {
		const raw = typeof onHandRawDecimal === "string" ? onHandRawDecimal.trim() : "";
		if (raw) {
			const norm = normalizeQuantityForSubmit(raw, unitPrecision, false);
			if (!norm.ok) return null;
			try {
				return toScaledBigInt(norm.value, unitPrecision);
			} catch {
				return null;
			}
		}

		if (onHandTreatAsMajor) {
			const norm = normalizeQuantityForSubmit(String(onHandScaledLegacy ?? "0"), unitPrecision, false);
			if (!norm.ok) return null;
			try {
				return toScaledBigInt(norm.value, unitPrecision);
			} catch {
				return null;
			}
		}

		const s = typeof onHandScaledLegacy === "string" ? onHandScaledLegacy : String(onHandScaledLegacy ?? "0");
		const cleaned = s.replace(/,/g, "").trim();
		if (!/^-?\d+$/.test(cleaned)) return null;
		try {
			return BigInt(cleaned);
		} catch {
			return null;
		}
	}, [onHandRawDecimal, onHandScaledLegacy, onHandTreatAsMajor, unitPrecision]);

	const stockOutExceedsOnHand = useMemo(() => {
		if (!canCheckStock) return false;
		if (deltaScaled === 0n) return false;
		if (deltaScaled >= 0n) return false;
		if (onHandScaledForCompare == null) return false;
		return -deltaScaled > onHandScaledForCompare;
	}, [canCheckStock, deltaScaled, onHandScaledForCompare]);

	const stockError = stockOutExceedsOnHand ? `Only ${onHandLabel} on hand. Reduce the quantity.` : null;

	// ✅ Gate Apply purely on BigInt delta (no Number overflow)
	const disabled = isBusy || !productId || deltaScaled === 0n || !!stockError;

	const submit = async () => {
		setError(null);

		if (!productId) {
			setError("Missing product ID.");
			return;
		}

		const normalized = normalizeQuantityForSubmit(qtySanitized, unitPrecision, allowNegative);
		if (!normalized.ok) {
			setError(normalized.message);
			return;
		}

		const qtyScaled = toScaledBigInt(normalized.value, unitPrecision);
		const delta = computeDeltaScaled(reason, qtyScaled);

		if (delta === 0n) {
			setError(`Enter a valid quantity (max ${unitPrecision} decimals).`);
			return;
		}

		if (stockError) {
			setError(stockError);
			return;
		}

		await withBusy("Applying stock adjustment…", async () => {
			try {
				await inventoryApi.adjustInventory(productId, {
					quantityDelta: formatScaledBigInt(delta, unitPrecision),
					reason,
					note: note.trim() || undefined,
					idempotencyKey: makeIdempotencyKey("inv_adj"),
				});

				if (onHandScaledForCompare != null) {
					patchPosCatalogOnHandCaches(qc, {
						productId,
						onHandCached: formatScaledBigInt(onHandScaledForCompare + delta, unitPrecision),
						updatedAt: new Date().toISOString(),
					});
				}
				invalidateInventoryAfterMutation(qc, { productId });

				await Promise.all([
					qc.invalidateQueries({ queryKey: inventoryKeys.all }),
					qc.invalidateQueries({ queryKey: inventoryKeys.productDetail(productId) }),
					qc.invalidateQueries({ queryKey: inventoryKeys.movements(productId, 10) }),
				]);

				router.replace(detailRoute as any);
			} catch (e) {
				setError(mapInventoryErrorToMessage(toInventoryDomainError(e)));
			}
		});
	};

	const qtyPlaceholder = useMemo(() => buildZeroPlaceholder(unitPrecision), [unitPrecision]);

	const title = product?.name?.trim() ? product.name : "Item";
	const imageUri = useMemo(() => {
		return toCacheBustedImageUri((product as any)?.primaryImageUrl, (product as any)?.updatedAt);
	}, [product]);
	const hasImage = Boolean(imageUri);
	const selectedReasonLabel = getReasonLabel(reason);
	const errorMessage = stockError ?? error;

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const thumbnailBg = theme.colors.surfaceVariant ?? theme.colors.surface;

	const categoryId = (product as any)?.category?.id ?? (product as any)?.categoryId ?? "";
	const categoryIsActive = useMemo(() => {
		if (categoryId && categoryStatusById.has(categoryId)) return categoryStatusById.get(categoryId);
		return (product as any)?.category?.isActive;
	}, [categoryId, categoryStatusById, product]);

	const categoryMeta = useMemo(() => {
		const rawName = (product as any)?.category?.name;
		const trimmedName = typeof rawName === "string" ? rawName.trim() : "";
		const normalizedName = trimmedName.toLowerCase();
		const hasCategory = trimmedName.length > 0 && normalizedName !== "none";

		const rawColor = (product as any)?.category?.color;
		const color = typeof rawColor === "string" && rawColor.trim() ? rawColor.trim() : null;

		return {
			name: hasCategory ? trimmedName : "None",
			hasCategory,
			isActive: categoryIsActive === true,
			color,
		};
	}, [categoryIsActive, product]);

	const categoryDotStyle = useMemo(() => {
		if (!categoryMeta.hasCategory) return { backgroundColor: "transparent", borderColor };
		const bg = categoryMeta.color ?? "transparent";
		const bc = categoryMeta.color ?? borderColor;
		const opacity = categoryMeta.isActive ? 1 : 0.5;
		return { backgroundColor: bg, borderColor: bc, opacity };
	}, [borderColor, categoryMeta.color, categoryMeta.hasCategory, categoryMeta.isActive]);

	const bottomPad = Platform.OS === "ios" ? 24 : 24 + keyboardHeight;

	const onNoteLayout = (e: LayoutChangeEvent) => {
		noteLayoutRef.current = e.nativeEvent.layout;
	};

	const ensureNoteVisible = () => {
		requestAnimationFrame(() => {
			setTimeout(() => {
				const layout = noteLayoutRef.current;
				if (!layout || !scrollRef.current || viewportH <= 0) {
					scrollRef.current?.scrollToEnd({ animated: true });
					return;
				}

				const EXTRA_GAP = 14;
				const effectiveKb = Platform.OS === "ios" ? 0 : keyboardHeight;

				const visibleTop = scrollYRef.current + 12;
				const visibleBottom = scrollYRef.current + viewportH - effectiveKb - EXTRA_GAP;

				const fieldTop = layout.y;
				const fieldBottom = layout.y + layout.height;

				if (fieldBottom > visibleBottom) {
					const target = fieldBottom - (viewportH - effectiveKb - EXTRA_GAP);
					scrollRef.current?.scrollTo({ y: clamp(target, 0, 999999), animated: true });
				} else if (fieldTop < visibleTop) {
					scrollRef.current?.scrollTo({ y: clamp(fieldTop - 12, 0, 999999), animated: true });
				}
			}, 120);
		});
	};

	return (
		<>
			<Stack.Screen options={headerOptions} />

			<BAIScreen padded={false} tabbed safeTop={false} style={styles.root}>
				<KeyboardAvoidingView
					style={[styles.kav, { backgroundColor: theme.colors.background }]}
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight + 8 : 0}
				>
					<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
						<View style={styles.flex1} onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}>
							<ScrollView
								ref={scrollRef}
								onScroll={(e) => {
									scrollYRef.current = e?.nativeEvent?.contentOffset?.y ?? 0;
								}}
								scrollEventThrottle={16}
								contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
								keyboardShouldPersistTaps='handled'
								keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
								showsVerticalScrollIndicator={false}
								alwaysBounceVertical={false}
								automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
							>
								<BAISurface style={styles.card} padded>
									{productDetailQuery.isLoading ? (
										<View style={styles.center}>
											<BAIActivityIndicator />
										</View>
									) : productDetailQuery.isError ? (
										<View style={styles.center}>
											<BAIText variant='title' numberOfLines={1}>
												{title}
											</BAIText>
											<BAIText variant='caption' muted style={{ marginTop: 6, textAlign: "center" }}>
												Unable to load item details. You can still adjust stock, but verify the item ID.
											</BAIText>
										</View>
									) : (
										<>
											<View style={styles.titleRow}>
												<View style={[styles.thumbnail, { borderColor, backgroundColor: thumbnailBg }]}>
													{hasImage ? (
														<Image source={{ uri: imageUri }} style={styles.thumbnailImage} resizeMode='cover' />
													) : (
														<View style={styles.thumbnailPlaceholder}>
															<FontAwesome6
																name='image'
																size={30}
																color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
															/>
														</View>
													)}
												</View>
												<View style={styles.titleTextCol}>
													<BAIText variant='title' numberOfLines={1} style={styles.titleText}>
														{title}
													</BAIText>
													<View style={styles.onHandRow}>
														<BAIText variant='caption' muted>
															On hand
														</BAIText>
														<BAIText variant='subtitle' numberOfLines={1} style={styles.onHandValue}>
															{onHandLabel}
														</BAIText>
													</View>
												</View>
											</View>

											<View style={styles.metaBlock}>
												<View style={styles.metaLine}>
													<BAIText variant='caption' muted style={styles.metaLabel}>
														Category:
													</BAIText>
													{categoryMeta.hasCategory ? <View style={[styles.categoryDot, categoryDotStyle]} /> : null}
													<BAIText variant='body' numberOfLines={1} style={styles.metaValue}>
														{categoryMeta.name}
													</BAIText>
												</View>

												{(product as any)?.sku ? (
													<View style={styles.metaLine}>
														<BAIText variant='caption' muted style={styles.metaLabel}>
															SKU:
														</BAIText>
														<BAIText variant='body' numberOfLines={1} style={styles.metaValue}>
															{(product as any).sku}
														</BAIText>
													</View>
												) : null}

												{(product as any)?.barcode ? (
													<View style={styles.metaLine}>
														<BAIText variant='caption' muted style={styles.metaLabel}>
															Barcode:
														</BAIText>
														<BAIText variant='body' numberOfLines={1} style={styles.metaValue}>
															{(product as any).barcode}
														</BAIText>
													</View>
												) : null}
											</View>
										</>
									)}
								</BAISurface>

								<BAISurface style={styles.card} padded>
									<View style={styles.headerBlock}>
										<BAIText variant='subtitle'>Adjust Stocks</BAIText>
										<BAIText variant='caption' muted style={styles.headerSub}>
											Apply a stock movement for this item. This action is audited.
										</BAIText>
										<View style={[styles.divider, { backgroundColor: borderColor }]} />
									</View>

									<View style={styles.sectionHeader}>
										<BAIText variant='subtitle'>Reason</BAIText>
										<BAIText variant='caption' muted numberOfLines={1} style={styles.sectionSub}>
											Selected: {selectedReasonLabel}
										</BAIText>
									</View>

									<View
										style={[
											styles.panel,
											{ borderColor, backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface },
										]}
									>
										{REASONS.map((r, idx) => (
											<ReasonRow
												key={r.value}
												label={r.label}
												helper={r.helper}
												selected={reason === r.value}
												disabled={isBusy}
												borderColor={borderColor}
												activeColor={theme.colors.primary}
												divider={idx !== REASONS.length - 1}
												onPress={() => {
													setReason(r.value);

													// Re-sanitize for new allowNegative rules; keep exact typed value (no blur padding).
													const nextAllowNeg = r.value === "ADJUSTMENT";
													setQtyText((prev) => {
														const s0 = sanitizeQuantityInput(prev, unitPrecision, nextAllowNeg);
														return enforceUdiqCaps(s0, unitPrecision, nextAllowNeg, qtyMaxLen);
													});

													setError(null);
												}}
											/>
										))}
									</View>

									<BAITextInput
										label={`Quantity${quantityUnitToken ? ` (${quantityUnitToken})` : ""}`}
										maxLength={qtyMaxLen}
										value={qtyText}
										onChangeText={(t) => {
											const s0 = sanitizeQuantityInput(t, unitPrecision, allowNegative);
											const s1 = enforceUdiqCaps(s0, unitPrecision, allowNegative, qtyMaxLen);
											setQtyText(s1);
											setError(null);
										}}
										onBlur={() => {
											if (isBusy) return;
											setQtyText((prev) => normalizeQuantityForBlur(prev, unitPrecision, allowNegative, qtyMaxLen));
										}}
										keyboardType={quantityKeyboardType}
										placeholder={qtyPlaceholder}
										disabled={isBusy}
										{...({ helperText: precisionHelperText } as any)}
									/>

									<View onLayout={onNoteLayout}>
										<BAITextInput
											label='Note (optional)'
											maxLength={(FIELD_LIMITS as any).note}
											value={note}
											onChangeText={(t) => setNote(sanitizeNote(t, (FIELD_LIMITS as any).note))}
											placeholder='Why are you adjusting stock?'
											multiline
											disabled={isBusy}
											onFocus={ensureNoteVisible}
										/>
									</View>

									{errorMessage ? (
										<BAIText variant='caption' style={{ color: theme.colors.error }}>
											{errorMessage}
										</BAIText>
									) : null}

									<View style={styles.actions}>
										<BAICTAPillButton
											intent='neutral'
											variant='outline'
											mode='outlined'
											style={styles.actionButton}
											onPress={guardedOnExit}
											disabled={isBusy}
										>
											Cancel
										</BAICTAPillButton>

										<BAICTAPillButton mode='contained' style={styles.actionButton} onPress={submit} disabled={disabled}>
											Apply
										</BAICTAPillButton>
									</View>
								</BAISurface>
							</ScrollView>
						</View>
					</TouchableWithoutFeedback>
				</KeyboardAvoidingView>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	flex1: { flex: 1 },
	kav: { flex: 1 },

	scrollContent: {
		flexGrow: 1,
		paddingHorizontal: 12,
		paddingTop: 0,
		gap: 12,
	},

	card: { gap: 12 },
	center: { padding: 12, alignItems: "center", justifyContent: "center" },
	titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	titleTextCol: { flex: 1, minWidth: 0, gap: 6 },
	titleText: { flex: 1 },
	thumbnail: {
		width: 48,
		height: 48,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	thumbnailImage: { width: "100%", height: "100%" },
	thumbnailPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
	onHandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	onHandValue: { fontWeight: "700" },

	metaBlock: { gap: 4 },
	metaLine: { flexDirection: "row", alignItems: "center", gap: 6 },
	metaLabel: { flexShrink: 0 },
	metaValue: { flexShrink: 1 },

	categoryDot: { width: 12, height: 12, borderRadius: 9, borderWidth: 1 },

	headerBlock: { gap: 6 },
	headerSub: { opacity: 0.9 },
	divider: { height: StyleSheet.hairlineWidth, opacity: 0.9 },

	sectionHeader: { marginTop: 2, gap: 2 },
	sectionSub: { opacity: 0.9 },

	panel: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		overflow: "hidden",
	},

	reasonRowItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		paddingVertical: 12,
		gap: 12,
	},

	reasonRowDivider: {
		borderBottomWidth: StyleSheet.hairlineWidth,
	},

	reasonRowLeft: {
		flex: 1,
		minWidth: 0,
		gap: 3,
	},

	reasonRowLabel: { lineHeight: 20 },
	reasonRowHelper: { opacity: 0.85, lineHeight: 16 },

	radioOuter: {
		width: 18,
		height: 18,
		borderRadius: 999,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},

	radioInner: {
		width: 10,
		height: 10,
		borderRadius: 999,
	},

	actions: { flexDirection: "row", gap: 10, justifyContent: "space-between" },
	actionButton: { flex: 1 },
});
