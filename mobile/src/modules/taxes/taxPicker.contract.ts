// BizAssist_mobile
// path: src/modules/taxes/taxPicker.contract.ts

export const TAX_PICKER_ROUTE = "/(app)/(tabs)/inventory/taxes/select" as const;

export const TAX_SELECTED_IDS_KEY = "selectedTaxIds" as const;
export const TAX_SELECTED_NAMES_KEY = "selectedTaxNames" as const;
export const TAX_SELECTION_SOURCE_KEY = "taxSelectionSource" as const;
export const TAX_EXEMPT_KEY = "taxExempt" as const;

export const RETURN_TO_KEY = "returnTo" as const;
export const DRAFT_ID_KEY = "draftId" as const;

export type TaxSelectionSource = "existing" | "cleared";

export type TaxPickerInboundParams = {
	[TAX_SELECTED_IDS_KEY]?: string;
	[TAX_SELECTED_NAMES_KEY]?: string;
	[TAX_SELECTION_SOURCE_KEY]?: TaxSelectionSource;
	[TAX_EXEMPT_KEY]?: string;
	[RETURN_TO_KEY]?: string;
	[DRAFT_ID_KEY]?: string;
};

function normalizeString(v: unknown): string {
	return String(v ?? "").trim();
}

function normalizeArray(input: unknown): string[] {
	if (Array.isArray(input)) {
		return input.map((value) => normalizeString(value)).filter(Boolean);
	}
	const raw = normalizeString(input);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.map((value) => normalizeString(value)).filter(Boolean);
		}
		return [];
	} catch {
		return [];
	}
}

export function normalizeReturnTo(raw: unknown): string | null {
	const value = normalizeString(raw);
	if (!value) return null;
	if (!value.startsWith("/")) return null;
	if (value === "undefined" || value === "null") return null;
	return value;
}

export function buildTaxSelectionParams(input: {
	selectedTaxIds: string[];
	selectedTaxNames: string[];
	selectionSource?: TaxSelectionSource;
	taxExempt?: boolean;
	draftId?: string;
}): TaxPickerInboundParams {
	const ids = Array.from(new Set(input.selectedTaxIds.map((id) => normalizeString(id)).filter(Boolean)));
	const names = Array.from(new Set(input.selectedTaxNames.map((name) => normalizeString(name)).filter(Boolean)));
	return {
		[TAX_SELECTED_IDS_KEY]: JSON.stringify(ids),
		[TAX_SELECTED_NAMES_KEY]: JSON.stringify(names),
		[TAX_SELECTION_SOURCE_KEY]: input.selectionSource,
		[TAX_EXEMPT_KEY]: input.taxExempt ? "1" : "0",
		[DRAFT_ID_KEY]: normalizeString(input.draftId),
	};
}

export function parseTaxSelectionParams(raw: Record<string, unknown>) {
	const selectedTaxIds = normalizeArray(raw?.[TAX_SELECTED_IDS_KEY]);
	const selectedTaxNames = normalizeArray(raw?.[TAX_SELECTED_NAMES_KEY]);
	const sourceRaw = normalizeString(raw?.[TAX_SELECTION_SOURCE_KEY]);
	const selectionSource: TaxSelectionSource | undefined =
		sourceRaw === "existing" || sourceRaw === "cleared" ? (sourceRaw as TaxSelectionSource) : undefined;
	const taxExemptRaw = normalizeString(raw?.[TAX_EXEMPT_KEY]);
	const taxExempt = taxExemptRaw === "1" || taxExemptRaw === "true";

	return {
		selectedTaxIds,
		selectedTaxNames,
		selectionSource,
		taxExempt,
		hasSelectionKey: raw?.[TAX_SELECTED_IDS_KEY] !== undefined,
		draftId: normalizeString(raw?.[DRAFT_ID_KEY]),
		hasDraftIdKey: raw?.[DRAFT_ID_KEY] !== undefined,
		returnTo: normalizeReturnTo(raw?.[RETURN_TO_KEY]),
	};
}
