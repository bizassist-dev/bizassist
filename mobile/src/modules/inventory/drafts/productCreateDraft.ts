// BizAssist_mobile
// path: src/modules/inventory/drafts/productCreateDraft.ts

export type ProductCreateDraft = {
	draftId: string;

	// core
	name: string;
	description: string;

	// category
	categoryId: string;
	categoryName: string;
	modifierGroupIds: string[];
	taxExempt: boolean;
	selectedTaxIds: string[];
	selectedTaxNames: string[];

	// ✅ unit (UoM)
	unitId: string;
	unitName: string;
	unitAbbreviation: string;
	unitCategory: string; // keep string to avoid cross-module enum coupling
	unitPrecisionScale: number; // 0–5

	// pricing (string inputs)
	priceText: string;
	costText: string;

	// inventory
	trackInventory: boolean;
	sku: string;
	barcode: string;
	initialOnHandText: string; // decimal string
	reorderPointText: string; // decimal string

	// media
	imageLocalUri: string;

	// POS tile
	posTileMode: "COLOR" | "IMAGE";
	posTileColor: string | null;
	posTileLabel: string;
	posTileLabelTouched: boolean;

	// options + variations
	selectedOptionSetIds: string[];
	selectedVariationKeys: string[];
	variationSelectionInitialized: boolean;
	optionSelections: {
		optionSetId: string;
		optionSetName: string;
		selectedValueIds: string[];
		selectedValueNames: string[];
		sortOrder: number;
	}[];
	variations: {
		variationKey: string;
		label: string;
		valueMap: Record<string, string>;
		sortOrder: number;
	}[];
};

const drafts = new Map<string, ProductCreateDraft>();
const listeners = new Map<string, Set<(draft: ProductCreateDraft | null) => void>>();

function makeId() {
	return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function notifyProductDraft(draftId: string, draft: ProductCreateDraft | null) {
	const id = (draftId ?? "").trim();
	if (!id) return;
	const subs = listeners.get(id);
	if (!subs || subs.size === 0) return;
	for (const listener of subs) listener(draft);
}

export function createProductDraft(forcedDraftId?: string): ProductCreateDraft {
	const draftId = (forcedDraftId ?? "").trim() || makeId();

	const draft: ProductCreateDraft = {
		draftId,

		name: "",
		description: "",

		categoryId: "",
		categoryName: "",
		modifierGroupIds: [],
		taxExempt: false,
		selectedTaxIds: [],
		selectedTaxNames: [],

		// ✅ unit defaults (Each is resolved at screen level via unitsApi list)
		unitId: "",
		unitName: "",
		unitAbbreviation: "",
		unitCategory: "COUNT",
		unitPrecisionScale: 0,

		priceText: "",
		costText: "",

		trackInventory: true,
		sku: "",
		barcode: "",
		initialOnHandText: "",
		reorderPointText: "",

		imageLocalUri: "",

		posTileMode: "COLOR",
		posTileColor: null,
		posTileLabel: "",
		posTileLabelTouched: false,

		selectedOptionSetIds: [],
		selectedVariationKeys: [],
		variationSelectionInitialized: false,
		optionSelections: [],
		variations: [],
	};

	drafts.set(draftId, draft);
	notifyProductDraft(draftId, draft);
	return draft;
}

export function getProductDraft(draftId: string): ProductCreateDraft | null {
	const id = (draftId ?? "").trim();
	if (!id) return null;
	return drafts.get(id) ?? null;
}

export function upsertProductDraft(draftId: string, next: Partial<ProductCreateDraft>): ProductCreateDraft {
	const id = (draftId ?? "").trim();
	const base = getProductDraft(id) ?? createProductDraft(id);

	const merged: ProductCreateDraft = {
		...base,
		...next,
		draftId: base.draftId, // enforce stable key
	};

	drafts.set(merged.draftId, merged);
	notifyProductDraft(merged.draftId, merged);
	return merged;
}

export function clearProductDraft(draftId: string) {
	const id = (draftId ?? "").trim();
	if (!id) return;
	drafts.delete(id);
	notifyProductDraft(id, null);
}

export function subscribeProductDraft(
	draftId: string,
	handler: (draft: ProductCreateDraft | null) => void,
): () => void {
	const id = (draftId ?? "").trim();
	if (!id) return () => {};

	let subs = listeners.get(id);
	if (!subs) {
		subs = new Set();
		listeners.set(id, subs);
	}

	subs.add(handler);

	return () => {
		const current = listeners.get(id);
		if (!current) return;
		current.delete(handler);
		if (current.size === 0) listeners.delete(id);
	};
}
