// path: src/modules/inventory/inventory.types.ts

export type InventoryMovementReason = "SALE" | "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";

export type InventoryMovement = {
	id: string;
	productId: string;
	storeId: string | null;
	quantityDelta: string; // UDQI decimal string
	reason: InventoryMovementReason;
	relatedSaleId: string | null;
	createdAt: string;
};

export type InventoryMovementsPage = {
	items: InventoryMovement[];
	nextCursor: string | null;
};

export type InventoryProductSnapshot = {
	id: string;
	name: string;
	sku: string | null;
	barcode: string | null;

	unitId: string | null;
	unitName: string | null;
	unitAbbreviation: string | null;
	unitCategory: string | null;
	unitPrecisionScale: number | null;

	categoryId: string | null;
	categoryName: string | null;
	categoryColor: string | null;
	categoryLegacy: string | null;

	description: string | null;

	price: string | null;
	cost: string | null;

	trackInventory: boolean;
	durationTotalMinutes: number | null;
	processingEnabled: boolean;
	durationInitialMinutes: number | null;
	durationProcessingMinutes: number | null;
	durationFinalMinutes: number | null;

	reorderPoint: string | null;
	onHandCached: string;

	primaryImageUrl: string | null;
	posTileMode: "COLOR" | "IMAGE";
	posTileColor: string | null;
	posTileLabel: string | null;
	modifierGroupIds?: string[];
	optionSelections?: Array<{
		optionSetId: string;
		optionSetName: string;
		selectedValueIds: string[];
		selectedValueNames: string[];
		sortOrder: number;
	}>;
	variations?: Array<{
		variationKey: string;
		label: string;
		valueMap: Record<string, string>;
		sortOrder: number;
	}>;
	isActive: boolean;

	createdAt: string;
	updatedAt: string;
};

export type InventoryProductDetail = {
	product: InventoryProductSnapshot;
	movements: InventoryMovement[];
};

export type LowStockItem = {
	id: string;
	name: string;
	sku: string | null;
	barcode: string | null;
	onHandCached: string;
	reorderPoint: string;
	primaryImageUrl: string | null;
	isActive: boolean;
};

export type LowStockPage = {
	items: LowStockItem[];
};

export type ReorderSuggestionItem = {
	productId: string;
	name: string;
	sku: string | null;
	barcode: string | null;

	onHandCached: string;
	reorderPoint: string | null;

	soldQty: string;
	velocityPerDay: number;

	targetStock: string;
	suggestedOrderQty: string;

	primaryImageUrl: string | null;
};

export type ReorderSuggestionsPage = {
	items: ReorderSuggestionItem[];
	meta: { days: number; leadDays: number };
};
