import type { QueryClient } from "@tanstack/react-query";

import type { CatalogListProductsResult, CatalogProduct } from "@/modules/catalog/catalog.types";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import type { InventoryProduct, ListProductsResponse } from "@/modules/inventory/inventory.types";

const POS_CATALOG_PRODUCTS_ROOT = ["pos", "catalog", "products"] as const;

function toNullableString(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return null;
}

function toMoneyString(value: unknown): string | null {
	if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
	return toNullableString(value);
}

function mapInventoryProductToCatalogProduct(product: InventoryProduct): CatalogProduct {
	return {
		id: product.id,
		businessId: "",
		storeId: null,
		type: product.type,
		name: product.name,
		sku: product.sku ?? null,
		barcode: product.barcode ?? null,
		unitId: product.unitId ?? null,
		categoryId: product.categoryId ?? null,
		categoryName: product.category?.name ?? null,
		categoryColor: product.category?.color ?? null,
		categoryLegacy: null,
		description: null,
		price: toMoneyString(product.price),
		cost: toMoneyString(product.cost),
		trackInventory: Boolean(product.trackInventory),
		reorderPoint: product.reorderPointRaw ?? toNullableString(product.reorderPoint),
		onHandCached: product.onHandCachedRaw ?? String(product.onHandCached ?? 0),
		primaryImageUrl: product.primaryImageUrl ?? null,
		posTileMode: product.posTileMode ?? "COLOR",
		posTileColor: product.posTileColor ?? null,
		isActive: Boolean(product.isActive),
		createdAt: product.createdAt ?? "",
		updatedAt: product.updatedAt ?? "",
	};
}

function cloneCatalogQueryData(data: CatalogListProductsResult): CatalogListProductsResult {
	return {
		items: data.items.slice(),
		nextCursor: data.nextCursor ?? null,
	};
}

export function getPosCatalogPlaceholderData(
	queryClient: QueryClient,
	args: { businessId: string; search: string },
): CatalogListProductsResult | undefined {
	const businessId = args.businessId.trim();
	const search = args.search.trim();

	const exactPosResults = queryClient.getQueriesData<CatalogListProductsResult>({
		queryKey: [...POS_CATALOG_PRODUCTS_ROOT, businessId, search],
	});
	for (const [, data] of exactPosResults) {
		if (data?.items?.length) return cloneCatalogQueryData(data);
	}

	if (!search) {
		const scopedPosResults = queryClient.getQueriesData<CatalogListProductsResult>({
			queryKey: [...POS_CATALOG_PRODUCTS_ROOT, businessId],
		});
		for (const [, data] of scopedPosResults) {
			if (data?.items?.length) return cloneCatalogQueryData(data);
		}

		const inventoryResults = queryClient.getQueriesData<ListProductsResponse>({
			queryKey: inventoryKeys.productsRoot(),
		});
		for (const [, data] of inventoryResults) {
			if (!data?.items?.length) continue;
			return {
				items: data.items.map(mapInventoryProductToCatalogProduct),
				nextCursor: data.nextCursor ?? null,
			};
		}
	}

	return undefined;
}

export function patchPosCatalogProductCaches(queryClient: QueryClient, product: InventoryProduct): void {
	const nextProduct = mapInventoryProductToCatalogProduct(product);

	queryClient.setQueriesData({ queryKey: POS_CATALOG_PRODUCTS_ROOT }, (current: unknown) => {
		if (!current || typeof current !== "object") return current;
		const typed = current as CatalogListProductsResult;
		if (!Array.isArray(typed.items)) return current;

		let changed = false;
		const items = typed.items.map((item) => {
			if (item.id !== nextProduct.id) return item;
			changed = true;
			return {
				...item,
				...nextProduct,
			};
		});

		return changed ? { ...typed, items } : current;
	});
}

export function patchPosCatalogOnHandCaches(
	queryClient: QueryClient,
	args: { productId: string; onHandCached: string; updatedAt?: string },
): void {
	const nextOnHand = args.onHandCached.trim();
	if (!nextOnHand) return;

	queryClient.setQueriesData({ queryKey: POS_CATALOG_PRODUCTS_ROOT }, (current: unknown) => {
		if (!current || typeof current !== "object") return current;
		const typed = current as CatalogListProductsResult;
		if (!Array.isArray(typed.items)) return current;

		let changed = false;
		const items = typed.items.map((item) => {
			if (item.id !== args.productId) return item;
			changed = true;
			return {
				...item,
				onHandCached: nextOnHand,
				updatedAt: args.updatedAt ?? item.updatedAt,
			};
		});

		return changed ? { ...typed, items } : current;
	});
}

export function patchPosCatalogImageCaches(
	queryClient: QueryClient,
	args: { productId: string; primaryImageUrl: string; updatedAt: string },
): void {
	queryClient.setQueriesData({ queryKey: POS_CATALOG_PRODUCTS_ROOT }, (current: unknown) => {
		if (!current || typeof current !== "object") return current;
		const typed = current as CatalogListProductsResult;
		if (!Array.isArray(typed.items)) return current;

		let changed = false;
		const items = typed.items.map((item) => {
			if (item.id !== args.productId) return item;
			changed = true;
			return {
				...item,
				primaryImageUrl: args.primaryImageUrl,
				updatedAt: args.updatedAt,
			};
		});

		return changed ? { ...typed, items } : current;
	});
}
