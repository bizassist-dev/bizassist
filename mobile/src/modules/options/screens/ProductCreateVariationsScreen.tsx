import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Modal, Portal, useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIHeaderActionButton } from "@/components/ui/BAIHeaderActionButton";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIPressableRow } from "@/components/ui/BAIPressableRow";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import {
	BAINumericBottomSheetKeyboard,
	type BAINumericBottomSheetKey,
} from "@/components/ui/BAINumericBottomSheetKeyboard";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAITextInput } from "@/components/ui/BAITextInput";
import { useAppBusy } from "@/hooks/useAppBusy";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { useProductCreateDraft } from "@/modules/inventory/drafts/useProductCreateDraft";
import { mapInventoryRouteToScope, type InventoryRouteScope } from "@/modules/inventory/navigation.scope";
import { optionsApi } from "@/modules/options/options.api";
import { useOptionSetsList } from "@/modules/options/options.queries";
import {
	DRAFT_ID_KEY,
	PRODUCT_ID_KEY,
	PRODUCT_CREATE_VARIATIONS_ROUTE,
	PRODUCT_SELECT_OPTIONS_ROUTE,
	ROOT_RETURN_TO_KEY,
	RETURN_TO_KEY,
	normalizeReturnTo,
} from "@/modules/options/productOptionPicker.contract";
import {
	UNIT_PICKER_ROUTE,
	parseUnitSelectionParams,
	UNIT_SELECTED_ID_KEY,
	UNIT_SELECTED_NAME_KEY,
	UNIT_SELECTED_ABBR_KEY,
	UNIT_SELECTED_CATEGORY_KEY,
	UNIT_SELECTED_PRECISION_KEY,
	UNIT_SELECTION_SOURCE_KEY,
	UNIT_CONTEXT_PRODUCT_TYPE_KEY,
	RETURN_TO_KEY as UNIT_RETURN_TO_KEY,
	DRAFT_ID_KEY as UNIT_DRAFT_ID_KEY,
} from "@/modules/units/unitPicker.contract";
import type { OptionSet, OptionValue } from "@/modules/options/options.types";
import { useAppToast } from "@/providers/AppToastProvider";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import { formatMoney } from "@/shared/money/money.format";
import { MONEY_INPUT_PRECISION } from "@/shared/money/money.constants";
import { digitsToMinorUnits, parseMinorUnits, sanitizeDigits } from "@/shared/money/money.minor";
import { toTitleCase } from "@/shared/text/titleCase";
import { GTIN_MAX_LENGTH, sanitizeGtinInput } from "@/shared/validation/gtin";
import { sanitizeLabelInput, sanitizeMoneyInput, sanitizeSkuInput } from "@/shared/validation/sanitize";

type GeneratedVariation = { variationKey: string; label: string; valueMap: Record<string, string>; sortOrder: number };
type MoneyFieldKey = "price" | "cost";

const MONEY_SCALE = MONEY_INPUT_PRECISION;
const MONEY_MAX_MINOR_DIGITS = 11;
const SCANNED_BARCODE_KEY = "scannedBarcode" as const;

function clampText(value: string, maxLength: number): string {
	if (maxLength <= 0) return "";
	return String(value ?? "").slice(0, maxLength);
}

function buildManualVariationKey(label: string): string {
	const slug = label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return `manual:${slug || "variation"}`;
}

function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((value, index) => value === b[index]);
}

function cartesian<T>(arrays: T[][]): T[][] {
	if (arrays.length === 0) return [];
	return arrays.reduce<T[][]>((acc, cur) => {
		if (acc.length === 0) return cur.map((value) => [value]);
		return acc.flatMap((prefix) => cur.map((value) => [...prefix, value]));
	}, []);
}

const COUNT_DISPLAY_NAME = "Per Piece";
const COUNT_CATALOG_ID = "ea";
const COUNT_DISPLAY_ABBR = "pc";

function normalizeUnitKey(value: string | null | undefined): string {
	return (value ?? "").trim().toLowerCase();
}

function isEachUnit(name: string | undefined, abbr: string | undefined, category?: string): boolean {
	if (category !== "COUNT") return false;
	const normalizedName = normalizeUnitKey(name);
	const normalizedAbbr = normalizeUnitKey(abbr ?? "");
	return normalizedName === "each" || normalizedName === "per piece" || normalizedAbbr === COUNT_CATALOG_ID;
}

function displayUnitName(name: string | undefined, abbr: string | undefined, category?: string): string {
	if (isEachUnit(name, abbr, category)) return COUNT_DISPLAY_NAME;
	return (name ?? "").trim();
}

function displayUnitValueInline(name: string, abbr: string, category?: string): string {
	const n = (name ?? "").trim();
	const a = (abbr ?? "").trim();
	if (isEachUnit(n, a, category)) return `${COUNT_DISPLAY_NAME} (${COUNT_DISPLAY_ABBR})`;
	if (!n) return COUNT_DISPLAY_NAME;
	if (!a) return n;
	return `${n} (${a})`;
}

function formatStockOnHandDisplay(raw: string): string {
	const trimmed = String(raw ?? "").trim();
	if (!trimmed) return "";
	if (!/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;
	if (!trimmed.includes(".")) return trimmed;
	return trimmed.replace(/\.?0+$/, "");
}

function moneyTextToMinorUnits(raw: string, scale: number, maxMinorDigits: number): number {
	const cleaned = String(raw ?? "")
		.replace(/,/g, "")
		.replace(/[^\d.]/g, "");
	if (!cleaned) return 0;

	const [intRaw = "", ...fractionParts] = cleaned.split(".");
	const intDigits = sanitizeDigits(intRaw);
	const fractionDigits = sanitizeDigits(fractionParts.join(""));
	const decimalDigits = scale > 0 ? fractionDigits.slice(0, scale).padEnd(scale, "0") : "";
	const combinedDigits = `${intDigits}${decimalDigits}`;

	if (!combinedDigits) return 0;
	return digitsToMinorUnits(combinedDigits, maxMinorDigits);
}

function minorUnitsToMoneyText(minorUnits: number, scale: number): string {
	const safeMinor = parseMinorUnits(minorUnits);
	if (safeMinor <= 0) return "";
	if (scale <= 0) return String(safeMinor);

	const divisor = 10 ** scale;
	const major = Math.floor(safeMinor / divisor);
	const minor = safeMinor % divisor;
	return `${major}.${String(minor).padStart(scale, "0")}`;
}

function applyMoneyKeypadKey(currentMinor: number, key: BAINumericBottomSheetKey, maxMinorDigits: number): number {
	const currentDigits = sanitizeDigits(String(parseMinorUnits(currentMinor)));

	if (key === "backspace") {
		const nextDigits = currentDigits.slice(0, -1);
		return nextDigits ? digitsToMinorUnits(nextDigits, maxMinorDigits) : 0;
	}

	if (currentDigits.length >= maxMinorDigits) return parseMinorUnits(currentMinor);
	return digitsToMinorUnits(`${currentDigits}${key}`, maxMinorDigits);
}

export function ProductCreateVariationsScreen({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const params = useLocalSearchParams();
	const theme = useTheme();
	const { currencyCode } = useActiveBusinessMeta();
	const { withBusy, busy } = useAppBusy();
	const { showError, showSuccess } = useAppToast();
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;

	const draftId = String(params[DRAFT_ID_KEY] ?? "").trim();
	const productId = String(params[PRODUCT_ID_KEY] ?? "").trim();
	const { draft, patch } = useProductCreateDraft(draftId || undefined);
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const fallbackReturnTo = useMemo(() => {
		if (productId) {
			return toScopedRoute(`/(app)/(tabs)/inventory/products/${encodeURIComponent(productId)}/edit`);
		}
		return toScopedRoute("/(app)/(tabs)/inventory/products/create");
	}, [productId, toScopedRoute]);
	const returnTo = useMemo(
		() => normalizeReturnTo(params[RETURN_TO_KEY]) ?? fallbackReturnTo,
		[fallbackReturnTo, params],
	);
	const rootReturnTo = useMemo(() => normalizeReturnTo(params[ROOT_RETURN_TO_KEY]) ?? returnTo, [params, returnTo]);
	const thisRoute = useMemo(() => toScopedRoute(PRODUCT_CREATE_VARIATIONS_ROUTE), [toScopedRoute]);
	const unitSelection = useMemo(() => parseUnitSelectionParams(params as any), [params]);

	const query = useOptionSetsList(false);
	const optionSets = useMemo(() => (query.data ?? []) as OptionSet[], [query.data]);
	const serverEligibleSelections = useMemo(
		() =>
			draft.optionSelections
				.filter((selection) => selection.optionSetId && selection.selectedValueIds.length > 0)
				.map((selection) => ({
					optionSetId: selection.optionSetId,
					optionValueIds: selection.selectedValueIds,
				})),
		[draft.optionSelections],
	);
	const canUseServerPreview = productId.length > 0 && serverEligibleSelections.length > 0;
	const previewQuery = useQuery({
		queryKey: ["options", "variationsPreview", productId, JSON.stringify(serverEligibleSelections)],
		queryFn: () => optionsApi.previewProductVariations(productId, { selections: serverEligibleSelections }),
		enabled: canUseServerPreview,
		staleTime: 30_000,
	});

	const generatedLocal = useMemo<GeneratedVariation[]>(() => {
		if (optionSets.length === 0 || draft.optionSelections.length === 0) return [];
		const setById = new Map<string, OptionSet>(optionSets.map((item) => [item.id, item]));
		const prepared = draft.optionSelections
			.slice()
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((selection) => {
				const set = setById.get(selection.optionSetId);
				if (!set) return null;
				const values = set.values.filter((value) => selection.selectedValueIds.includes(value.id));
				return values.length > 0 ? { selection, values } : null;
			})
			.filter((value): value is NonNullable<typeof value> => !!value);
		if (prepared.length !== draft.optionSelections.length) return [];
		const combos = cartesian<OptionValue>(prepared.map((row) => row.values));
		return combos.map((combo, idx) => {
			const pairs = combo.map((value) => ({ optionSetId: value.optionSetId, optionValueId: value.id }));
			const variationKey = pairs
				.slice()
				.sort((a, b) => a.optionSetId.localeCompare(b.optionSetId))
				.map((pair) => `${pair.optionSetId}:${pair.optionValueId}`)
				.join("|");
			const valueMap = Object.fromEntries(pairs.map((pair) => [pair.optionSetId, pair.optionValueId]));
			const label = combo.map((value) => value.name).join(", ");
			return { variationKey, valueMap, label, sortOrder: idx };
		});
	}, [draft.optionSelections, optionSets]);

	const generated = useMemo<GeneratedVariation[]>(() => {
		if (!canUseServerPreview) return generatedLocal;
		const items = previewQuery.data?.items ?? [];
		return items.map((item, idx) => ({
			variationKey: item.variationKey,
			label: item.label,
			valueMap: item.valueMap,
			sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : idx,
		}));
	}, [canUseServerPreview, generatedLocal, previewQuery.data?.items]);

	const existingVariations = useMemo(
		() => draft.variations.slice().sort((a, b) => a.sortOrder - b.sortOrder),
		[draft.variations],
	);
	const existingVariationKeySet = useMemo(
		() => new Set(existingVariations.map((variation) => variation.variationKey)),
		[existingVariations],
	);
	const existingGeneratedVariations = useMemo(
		() => generated.filter((variation) => existingVariationKeySet.has(variation.variationKey)),
		[existingVariationKeySet, generated],
	);
	const hasExistingVariations = existingGeneratedVariations.length > 0;
	const existingVariationPreviewLabel = existingGeneratedVariations[0]?.label ?? existingVariations[0]?.label ?? "";
	const selectedKeys = useMemo(() => {
		const generatedKeys = new Set(generated.map((variation) => variation.variationKey));
		const normalizedDraftKeys = draft.selectedVariationKeys.filter((key) => generatedKeys.has(key));
		if (draft.variationSelectionInitialized || generated.length === 0) return normalizedDraftKeys;
		const normalizedCommittedKeys = draft.variations
			.map((variation) => variation.variationKey)
			.filter((key) => generatedKeys.has(key));
		if (normalizedCommittedKeys.length > 0) return normalizedCommittedKeys;
		return generated.map((variation) => variation.variationKey);
	}, [draft.selectedVariationKeys, draft.variationSelectionInitialized, draft.variations, generated]);

	useEffect(() => {
		const nextInitialized = generated.length > 0 ? true : draft.variationSelectionInitialized;
		if (
			draft.variationSelectionInitialized === nextInitialized &&
			arraysEqual(draft.selectedVariationKeys, selectedKeys)
		) {
			return;
		}
		patch({
			selectedVariationKeys: selectedKeys,
			variationSelectionInitialized: nextInitialized,
		});
	}, [draft.selectedVariationKeys, draft.variationSelectionInitialized, generated.length, patch, selectedKeys]);

	const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
	const allSelected = generated.length > 0 && generated.every((variation) => selectedSet.has(variation.variationKey));
	const [manualLabel, setManualLabel] = useState("");
	const [duplicateOpen, setDuplicateOpen] = useState(false);
	const priceInputRef = useRef<any>(null);
	const costInputRef = useRef<any>(null);
	const [activeMoneyField, setActiveMoneyField] = useState<MoneyFieldKey | null>(null);
	const isManualMode = draft.selectedOptionSetIds.length === 0;
	const rawPriceText = String(draft.priceText ?? "").trim();
	const rawCostText = String(draft.costText ?? "").trim();
	const priceDisplay = formatMoney({ amount: rawPriceText || 0, currencyCode });
	const costDisplay = formatMoney({ amount: rawCostText || 0, currencyCode });
	const unitValueText = useMemo(() => {
		const name = (draft.unitName ?? "").trim();
		const abbr = (draft.unitAbbreviation ?? "").trim();
		return displayUnitValueInline(name, abbr, String(draft.unitCategory || "COUNT"));
	}, [draft.unitAbbreviation, draft.unitCategory, draft.unitName]);
	const stockOnHandValue = useMemo(() => formatStockOnHandDisplay(draft.initialOnHandText), [draft.initialOnHandText]);
	const reorderPointValue = useMemo(() => formatStockOnHandDisplay(draft.reorderPointText), [draft.reorderPointText]);
	const canCreateManual = toTitleCase(sanitizeLabelInput(manualLabel)).trim().length > 0;
	const isMoneyKeyboardOpen = activeMoneyField !== null;
	const moneyKeyboardKey = useMemo(
		() => `${draft.draftId}:${activeMoneyField ?? "closed"}`,
		[activeMoneyField, draft.draftId],
	);
	const priceMinor = useMemo(
		() => moneyTextToMinorUnits(draft.priceText, MONEY_SCALE, MONEY_MAX_MINOR_DIGITS),
		[draft.priceText],
	);
	const costMinor = useMemo(
		() => moneyTextToMinorUnits(draft.costText, MONEY_SCALE, MONEY_MAX_MINOR_DIGITS),
		[draft.costText],
	);

	const openMoneyKeyboard = useCallback(
		(field: MoneyFieldKey) => {
			if (busy.isBusy) return;
			setActiveMoneyField(field);
		},
		[busy.isBusy],
	);

	const closeMoneyKeyboard = useCallback(() => {
		if (activeMoneyField === "price") {
			priceInputRef.current?.blur?.();
		}
		if (activeMoneyField === "cost") {
			costInputRef.current?.blur?.();
		}
		setActiveMoneyField(null);
	}, [activeMoneyField]);

	const dismissMoneyKeyboardIfOpen = useCallback(() => {
		if (activeMoneyField === null) return;
		closeMoneyKeyboard();
	}, [activeMoneyField, closeMoneyKeyboard]);

	const onMoneyKeyPress = useCallback(
		(key: BAINumericBottomSheetKey) => {
			if (!activeMoneyField) return;

			const currentMinor = activeMoneyField === "price" ? priceMinor : costMinor;
			const nextMinor = applyMoneyKeypadKey(currentMinor, key, MONEY_MAX_MINOR_DIGITS);
			if (nextMinor === currentMinor) return;

			const nextValue = minorUnitsToMoneyText(nextMinor, MONEY_SCALE);
			if (activeMoneyField === "price") {
				patch({ priceText: nextValue });
				return;
			}
			patch({ costText: nextValue });
		},
		[activeMoneyField, costMinor, patch, priceMinor],
	);

	useEffect(() => {
		const raw =
			typeof (params as any)?.[SCANNED_BARCODE_KEY] === "string"
				? String((params as any)[SCANNED_BARCODE_KEY]).trim()
				: "";
		const value = sanitizeGtinInput(raw).trim();
		if (!value) return;

		patch({ barcode: value });

		(router as any).setParams?.({
			[SCANNED_BARCODE_KEY]: undefined,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [(params as any)?.[SCANNED_BARCODE_KEY]]);

	useEffect(() => {
		const rawSelectedId =
			typeof (params as any)?.[UNIT_SELECTED_ID_KEY] === "string"
				? String((params as any)[UNIT_SELECTED_ID_KEY]).trim()
				: "";
		const selectedUnitId = (unitSelection.selectedUnitId || rawSelectedId).trim();
		if (!selectedUnitId) {
			if (unitSelection.hasSelectionKey || (params as any)?.[UNIT_SELECTED_ID_KEY] !== undefined) {
				(router as any).setParams?.({
					[UNIT_SELECTED_ID_KEY]: undefined,
					[UNIT_SELECTED_NAME_KEY]: undefined,
					[UNIT_SELECTED_ABBR_KEY]: undefined,
					[UNIT_SELECTED_CATEGORY_KEY]: undefined,
					[UNIT_SELECTED_PRECISION_KEY]: undefined,
					[UNIT_SELECTION_SOURCE_KEY]: undefined,
					[UNIT_CONTEXT_PRODUCT_TYPE_KEY]: undefined,
				});
			}
			return;
		}

		const selectedUnitName =
			(unitSelection.selectedUnitName || String((params as any)?.[UNIT_SELECTED_NAME_KEY] ?? "")).trim() ||
			COUNT_DISPLAY_NAME;
		const selectedUnitAbbreviation = (
			unitSelection.selectedUnitAbbreviation || String((params as any)?.[UNIT_SELECTED_ABBR_KEY] ?? "")
		).trim();
		const selectedUnitCategory = String(
			unitSelection.selectedUnitCategory ?? (params as any)?.[UNIT_SELECTED_CATEGORY_KEY] ?? "COUNT",
		);

		patch({
			unitId: selectedUnitId,
			unitName: displayUnitName(selectedUnitName, selectedUnitAbbreviation, selectedUnitCategory) || COUNT_DISPLAY_NAME,
			unitAbbreviation: selectedUnitAbbreviation,
			unitCategory: selectedUnitCategory,
			unitPrecisionScale:
				typeof unitSelection.selectedUnitPrecisionScale === "number"
					? unitSelection.selectedUnitPrecisionScale
					: Number((params as any)?.[UNIT_SELECTED_PRECISION_KEY] ?? 0) || 0,
		});

		(router as any).setParams?.({
			[UNIT_SELECTED_ID_KEY]: undefined,
			[UNIT_SELECTED_NAME_KEY]: undefined,
			[UNIT_SELECTED_ABBR_KEY]: undefined,
			[UNIT_SELECTED_CATEGORY_KEY]: undefined,
			[UNIT_SELECTED_PRECISION_KEY]: undefined,
			[UNIT_SELECTION_SOURCE_KEY]: undefined,
			[UNIT_CONTEXT_PRODUCT_TYPE_KEY]: undefined,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		unitSelection.selectedUnitId,
		unitSelection.selectedUnitName,
		unitSelection.selectedUnitAbbreviation,
		unitSelection.selectedUnitCategory,
		unitSelection.selectedUnitPrecisionScale,
		unitSelection.hasSelectionKey,
		params,
	]);

	const onBack = useCallback(() => {
		router.replace({
			pathname: returnTo as any,
			params: {
				[DRAFT_ID_KEY]: draft.draftId,
				...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
			} as any,
		});
	}, [draft.draftId, productId, returnTo, router]);

	const onCreateGenerated = useCallback(async () => {
		const next = generated
			.filter((variation) => selectedSet.has(variation.variationKey))
			.map((variation, idx) => ({ ...variation, sortOrder: idx }));

		if (productId && serverEligibleSelections.length > 0) {
			const result = await withBusy("Saving variations...", async () => {
				try {
					await optionsApi.generateProductVariations(productId, {
						selections: serverEligibleSelections,
						selectedVariationKeys: next.map((variation) => variation.variationKey),
					});
					showSuccess("Variations saved.");
					return true;
				} catch (e: any) {
					const payload = e?.response?.data;
					const message =
						payload?.message ??
						payload?.error ??
						payload?.errorMessage ??
						payload?.error?.message ??
						"Failed to save variations.";
					showError(String(message));
					return false;
				}
			});

			if (!result) return;
		}

		patch({
			selectedVariationKeys: next.map((variation) => variation.variationKey),
			variationSelectionInitialized: true,
			variations: next,
		});
		router.replace({
			pathname: rootReturnTo as any,
			params: {
				[DRAFT_ID_KEY]: draft.draftId,
				...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
			} as any,
		});
	}, [
		generated,
		patch,
		productId,
		rootReturnTo,
		router,
		selectedSet,
		serverEligibleSelections,
		showError,
		showSuccess,
		withBusy,
		draft.draftId,
	]);

	const onCreateManual = useCallback(async () => {
		if (!canCreateManual) return;

		const label = toTitleCase(sanitizeLabelInput(manualLabel)).trim();
		if (!label) return;
		const variationKey = buildManualVariationKey(label);

		if (
			draft.variations.some(
				(variation) =>
					variation.variationKey === variationKey || variation.label.trim().toLowerCase() === label.toLowerCase(),
			)
		) {
			setDuplicateOpen(true);
			return;
		}

		const nextVariations = [
			...draft.variations,
			{ variationKey, label, valueMap: {}, sortOrder: draft.variations.length },
		].map((variation, idx) => ({ ...variation, sortOrder: idx }));

		if (productId) {
			let syncFailed = false;
			await withBusy("Saving variation...", async () => {
				try {
					await optionsApi.syncManualProductVariations(productId, {
						variations: nextVariations.map((variation) => ({
							variationKey: variation.variationKey,
							label: variation.label,
							sortOrder: variation.sortOrder,
						})),
					});
				} catch (e: any) {
					const payload = e?.response?.data;
					const message =
						payload?.message ??
						payload?.error ??
						payload?.errorMessage ??
						payload?.error?.message ??
						"Failed to save variation.";
					showError(String(message));
					syncFailed = true;
				}
			});
			if (syncFailed) return;
		}

		patch({
			selectedOptionSetIds: [],
			optionSelections: [],
			selectedVariationKeys: nextVariations.map((variation) => variation.variationKey),
			variationSelectionInitialized: true,
			variations: nextVariations,
		});
		router.replace({
			pathname: rootReturnTo as any,
			params: {
				[DRAFT_ID_KEY]: draft.draftId,
				...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
			} as any,
		});
	}, [
		canCreateManual,
		draft.draftId,
		draft.variations,
		manualLabel,
		patch,
		productId,
		rootReturnTo,
		router,
		showError,
		withBusy,
	]);

	const onCreate = useCallback(async () => {
		if (isManualMode && generated.length === 0) {
			await onCreateManual();
			return;
		}
		await onCreateGenerated();
	}, [generated.length, isManualMode, onCreateGenerated, onCreateManual]);

	const onOpenManageStock = useCallback(() => {
		dismissMoneyKeyboardIfOpen();
		router.replace({
			pathname: toScopedRoute("/(app)/(tabs)/inventory/products/manage-stock") as any,
			params: {
				draftId: draft.draftId,
				returnTo: thisRoute,
				...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
			} as any,
		});
	}, [dismissMoneyKeyboardIfOpen, draft.draftId, productId, router, thisRoute, toScopedRoute]);

	const onOpenUnitPicker = useCallback(() => {
		dismissMoneyKeyboardIfOpen();
		router.replace({
			pathname: toScopedRoute(UNIT_PICKER_ROUTE) as any,
			params: {
				[UNIT_RETURN_TO_KEY]: thisRoute,
				[UNIT_DRAFT_ID_KEY]: draft.draftId,
				...(draft.unitId ? { [UNIT_SELECTED_ID_KEY]: draft.unitId } : {}),
				[UNIT_SELECTED_NAME_KEY]: draft.unitName || COUNT_DISPLAY_NAME,
				[UNIT_SELECTED_ABBR_KEY]: draft.unitAbbreviation || "",
				[UNIT_SELECTED_CATEGORY_KEY]: draft.unitCategory || "COUNT",
				[UNIT_SELECTED_PRECISION_KEY]: String(draft.unitPrecisionScale ?? 0),
				[UNIT_CONTEXT_PRODUCT_TYPE_KEY]: "PHYSICAL",
				[UNIT_SELECTION_SOURCE_KEY]: "existing",
			} as any,
		});
	}, [
		draft.draftId,
		draft.unitAbbreviation,
		draft.unitCategory,
		draft.unitId,
		draft.unitName,
		draft.unitPrecisionScale,
		router,
		thisRoute,
		dismissMoneyKeyboardIfOpen,
		toScopedRoute,
	]);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom style={styles.root}>
				<View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
					<BAIHeader
						title='Create Variation'
						variant='exit'
						onLeftPress={onBack}
						onRightPress={onCreate}
						rightDisabled={
							busy.isBusy ||
							(generated.length > 0 ? selectedKeys.length === 0 : isManualMode ? !canCreateManual : false)
						}
						rightSlot={({ disabled }) => (
							<BAIHeaderActionButton label={generated.length > 0 ? "Create" : "Done"} disabled={disabled} />
						)}
					/>
					<BAISurface style={[styles.card, { borderColor }]} padded={false}>
						{query.isLoading || (canUseServerPreview && previewQuery.isLoading) ? (
							<View style={styles.stateScreenWrap}>
								<View style={styles.stateWrap}>
									<BAIText variant='body' muted>
										Loading variations...
									</BAIText>
								</View>
							</View>
						) : query.isError || (canUseServerPreview && previewQuery.isError) ? (
							<View style={styles.stateScreenWrap}>
								<View style={styles.stateWrap}>
									<BAIRetryButton
										compact
										onPress={() => {
											void query.refetch();
											if (canUseServerPreview) void previewQuery.refetch();
										}}
									>
										Retry
									</BAIRetryButton>
								</View>
							</View>
						) : generated.length === 0 && isManualMode ? (
							<View style={styles.stateScreenWrap}>
								<View style={styles.manualWrap}>
									<BAITextInput
										label='Variation name'
										value={manualLabel}
										onChangeText={(value) => setManualLabel(clampText(toTitleCase(value), FIELD_LIMITS.productName))}
										onBlur={() => setManualLabel((prev) => toTitleCase(sanitizeLabelInput(prev)).trim())}
										onFocus={dismissMoneyKeyboardIfOpen}
										placeholder='e.g. Regular'
										maxLength={FIELD_LIMITS.productName}
										disabled={busy.isBusy}
									/>

									<BAIPressableRow
										label='Stock on hand'
										value='Manage Stock'
										onPress={onOpenManageStock}
										disabled={busy.isBusy}
										style={{ marginTop: 8 }}
									/>

									<View style={{ height: 20 }} />
									<View style={[styles.sectionTopDivider, { backgroundColor: borderColor }]} />
									<View style={styles.inventorySection}>
										<BAIText variant='subtitle' style={{ marginBottom: 8 }}>
											Sales information
										</BAIText>

										<BAITextInput
											label='GTIN (Barcode)'
											value={draft.barcode}
											onChangeText={(t) => patch({ barcode: sanitizeGtinInput(t) })}
											onFocus={dismissMoneyKeyboardIfOpen}
											placeholder='UPC, EAN, or ISBN'
											maxLength={GTIN_MAX_LENGTH}
											disabled={busy.isBusy}
										/>

										<BAITextInput
											label='SKU'
											value={draft.sku}
											onChangeText={(t) => patch({ sku: sanitizeSkuInput(t) })}
											onFocus={dismissMoneyKeyboardIfOpen}
											placeholder='None'
											disabled={busy.isBusy}
											style={{ marginTop: 4 }}
										/>

										<BAIPressableRow
											label='Unit'
											value={unitValueText}
											onPress={onOpenUnitPicker}
											disabled={busy.isBusy}
											style={{ marginTop: 8 }}
										/>

										<BAITextInput
											ref={priceInputRef}
											label='Price'
											value={draft.priceText}
											onChangeText={(t) => patch({ priceText: sanitizeMoneyInput(t) })}
											showSoftInputOnFocus={false}
											onFocus={() => openMoneyKeyboard("price")}
											placeholder={priceDisplay}
											disabled={busy.isBusy}
											style={{ marginTop: 4 }}
										/>

										<BAITextInput
											ref={costInputRef}
											label='Cost (optional)'
											value={draft.costText}
											onChangeText={(t) => patch({ costText: sanitizeMoneyInput(t) })}
											showSoftInputOnFocus={false}
											onFocus={() => openMoneyKeyboard("cost")}
											placeholder={costDisplay}
											disabled={busy.isBusy}
											style={{ marginTop: 4 }}
										/>

										<Pressable
											onPress={onOpenManageStock}
											disabled={busy.isBusy}
											style={({ pressed }) => [
												styles.stockCard,
												{
													borderColor,
													backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
												},
												pressed && !busy.isBusy ? styles.stockCardPressed : null,
												busy.isBusy ? styles.stockCardDisabled : null,
											]}
										>
											<View style={styles.stockCardText}>
												<BAIText variant='caption' muted>
													Stock on hand
												</BAIText>
												<BAIText variant='subtitle'>{stockOnHandValue || "None"}</BAIText>
												<BAIText variant='caption' muted style={styles.stockCardMeta}>
													Reorder point: {reorderPointValue || "None"}
												</BAIText>
											</View>
											<View style={styles.stockCardActionWrap}>
												<BAIText variant='subtitle' style={styles.stockCardAction}>
													Manage Stock
												</BAIText>
												<MaterialCommunityIcons
													name='chevron-right'
													size={24}
													color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
												/>
											</View>
										</Pressable>
									</View>

									<BAIText variant='caption' muted style={styles.taxHint}>
										Tax included in price. Leave the price blank to enter at the time of sale.
									</BAIText>

									<BAIButton
										mode='contained'
										variant='subtle'
										shape='pill'
										onPress={() => {
											router.replace({
												pathname: toScopedRoute(PRODUCT_SELECT_OPTIONS_ROUTE) as any,
												params: {
													[DRAFT_ID_KEY]: draft.draftId,
													[RETURN_TO_KEY]: rootReturnTo,
													...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
												} as any,
											});
										}}
										disabled={busy.isBusy}
										style={styles.useOptionsButton}
									>
										Use Option Sets Instead
									</BAIButton>
								</View>
							</View>
						) : generated.length === 0 ? (
							<View style={styles.stateScreenWrap}>
								<View style={styles.stateWrap}>
									<BAIText variant='body' muted>
										No variations available yet.
									</BAIText>
									<BAIText variant='caption' muted style={styles.emptyHintText}>
										Set up options and values to create variations.
									</BAIText>
									<View style={styles.emptyActions}>
										<BAIButton
											variant='outline'
											intent='neutral'
											shape='pill'
											disabled={busy.isBusy}
											onPress={() => {
												router.replace({
													pathname: toScopedRoute(PRODUCT_SELECT_OPTIONS_ROUTE) as any,
													params: {
														[DRAFT_ID_KEY]: draft.draftId,
														[RETURN_TO_KEY]: rootReturnTo,
														...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
													} as any,
												});
											}}
										>
											Set up options
										</BAIButton>
									</View>
								</View>
							</View>
						) : (
							<>
								{hasExistingVariations ? (
									<View style={[styles.existingSection, { borderBottomColor: borderColor }]}>
										<View style={styles.existingSectionHeader}>
											<BAIText variant='subtitle' style={styles.flex}>
												Update existing variations
											</BAIText>
											{existingVariationPreviewLabel ? (
												<BAIText variant='body' muted numberOfLines={1} style={styles.existingSectionValue}>
													{existingVariationPreviewLabel}
												</BAIText>
											) : null}
										</View>
										<BAIText variant='caption' muted>
											Existing variations will be updated with this option selection.
										</BAIText>
									</View>
								) : null}
								<View style={[styles.optionsTitleWrap, { borderBottomColor: borderColor }]}>
									<BAIText variant='subtitle'>{hasExistingVariations ? "New variations" : "Variations"}</BAIText>
								</View>
								<FlatList
									data={generated}
									keyExtractor={(item) => item.variationKey}
									style={styles.optionsList}
									contentContainerStyle={styles.listContent}
									showsVerticalScrollIndicator={false}
									keyboardShouldPersistTaps='handled'
									ListHeaderComponent={
										<View style={[styles.row, { borderColor }]}>
											<BAIText variant='body' style={[styles.flex, styles.body400]}>
												All variations
											</BAIText>
											<MaterialCommunityIcons
												name={allSelected ? "check-circle" : "checkbox-blank-circle-outline"}
												size={34}
												color={allSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
												onPress={() => {
													if (allSelected) {
														patch({
															selectedVariationKeys: [],
															variationSelectionInitialized: true,
														});
														return;
													}
													patch({
														selectedVariationKeys: generated.map((variation) => variation.variationKey),
														variationSelectionInitialized: true,
													});
												}}
											/>
										</View>
									}
									renderItem={({ item }) => {
										const checked = selectedSet.has(item.variationKey);
										return (
											<View style={[styles.row, { borderColor }]}>
												<BAIText variant='body' style={[styles.flex, styles.body400]}>
													{item.label}
												</BAIText>
												<MaterialCommunityIcons
													name={checked ? "check-circle" : "checkbox-blank-circle-outline"}
													size={34}
													color={checked ? theme.colors.primary : theme.colors.onSurfaceVariant}
													onPress={() => {
														const nextSelectedKeys = selectedSet.has(item.variationKey)
															? selectedKeys.filter((key) => key !== item.variationKey)
															: [...selectedKeys, item.variationKey];
														patch({
															selectedVariationKeys: nextSelectedKeys,
															variationSelectionInitialized: true,
														});
													}}
												/>
											</View>
										);
									}}
								/>
							</>
						)}
					</BAISurface>
				</View>
			</BAIScreen>

			<BAINumericBottomSheetKeyboard
				visible={isMoneyKeyboardOpen}
				onDismiss={closeMoneyKeyboard}
				onKeyPress={onMoneyKeyPress}
				sheetKey={moneyKeyboardKey}
			/>

			<Portal>
				<Modal
					visible={duplicateOpen}
					onDismiss={() => setDuplicateOpen(false)}
					contentContainerStyle={styles.modalHost}
				>
					<BAISurface style={[styles.modalCard, { borderColor }]} padded>
						<BAIText variant='title' style={styles.modalTitle}>
							Duplicate variation
						</BAIText>
						<BAIText variant='body' muted>
							A variation with this name already exists.
						</BAIText>
						<BAIButton mode='contained' shape='pill' onPress={() => setDuplicateOpen(false)} style={styles.modalButton}>
							Ok
						</BAIButton>
					</BAISurface>
				</Modal>
			</Portal>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	screen: { flex: 1, minHeight: 0, paddingHorizontal: 10, paddingTop: 0, paddingBottom: 0 },
	card: {
		flex: 1,
		minHeight: 0,
		borderWidth: 1,
		borderRadius: 24,
		gap: 4,
		paddingHorizontal: 0,
		paddingTop: 10,
		paddingBottom: 0,
		marginTop: 0,
		overflow: "hidden",
	},
	stateScreenWrap: { flex: 1, minHeight: 0 },
	stateWrap: { flex: 1, minHeight: 180, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
	emptyHintText: {
		textAlign: "center",
		marginTop: 6,
	},
	emptyActions: {
		marginTop: 14,
		gap: 8,
		width: "100%",
	},
	manualWrap: {
		flex: 1,
		paddingHorizontal: 12,
		paddingBottom: 14,
		paddingTop: 6,
	},
	sectionTopDivider: {
		height: 4,
	},
	inventorySection: {
		marginTop: 10,
	},
	taxHint: {
		marginTop: 10,
		lineHeight: 18,
	},
	stockCard: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 14,
		paddingVertical: 12,
		gap: 12,
		borderWidth: 1,
		borderRadius: 12,
		marginTop: 8,
	},
	stockCardText: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	stockCardMeta: {
		marginTop: 2,
	},
	stockCardActionWrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	stockCardPressed: {
		opacity: 0.85,
	},
	stockCardDisabled: {
		opacity: 0.55,
	},
	stockCardAction: {
		fontWeight: "400",
	},
	useOptionsButton: {
		marginTop: 14,
	},
	optionsList: { flex: 1, minHeight: 0 },
	listContent: { paddingBottom: 12 },
	optionsTitleWrap: {
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	existingSection: {
		paddingHorizontal: 14,
		paddingTop: 8,
		paddingBottom: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		gap: 4,
	},
	existingSectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	existingSectionValue: {
		maxWidth: "45%",
		textAlign: "right",
	},
	row: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderBottomWidth: StyleSheet.hairlineWidth,
		flexDirection: "row",
		alignItems: "center",
	},
	modalHost: { paddingHorizontal: 16 },
	modalCard: {
		borderRadius: 24,
		borderWidth: StyleSheet.hairlineWidth,
	},
	modalTitle: { marginBottom: 10 },
	modalButton: { marginTop: 16 },
	pressed: {
		opacity: 0.86,
	},
	flex: { flex: 1 },
	body400: { fontWeight: "400" },
});
