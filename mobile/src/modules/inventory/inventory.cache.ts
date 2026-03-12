import type { QueryClient } from "@tanstack/react-query";

import { inventoryKeys } from "@/modules/inventory/inventory.queries";

type ProductImageCachePatch = {
	primaryImageUrl: string;
	updatedAt: string;
};

function patchProductRecord(current: any, productId: string, patch: ProductImageCachePatch) {
	if (!current || typeof current !== "object") return current;
	if (String(current.id ?? "").trim() !== productId) return current;
	return {
		...current,
		primaryImageUrl: patch.primaryImageUrl,
		updatedAt: patch.updatedAt,
	};
}

function patchListItems(items: unknown, productId: string, patch: ProductImageCachePatch) {
	if (!Array.isArray(items)) return items;
	let changed = false;
	const nextItems = items.map((item) => {
		const nextItem = patchProductRecord(item, productId, patch);
		if (nextItem !== item) changed = true;
		return nextItem;
	});
	return changed ? nextItems : items;
}

function patchInventoryListCache(current: any, productId: string, patch: ProductImageCachePatch) {
	if (!current || typeof current !== "object") return current;

	if (Array.isArray(current.pages)) {
		let changed = false;
		const nextPages = current.pages.map((page: any) => {
			if (!page || typeof page !== "object") return page;
			const nextItems = patchListItems(page.items, productId, patch);
			if (nextItems !== page.items) {
				changed = true;
				return { ...page, items: nextItems };
			}
			return page;
		});
		return changed ? { ...current, pages: nextPages } : current;
	}

	const nextItems = patchListItems(current.items, productId, patch);
	if (nextItems !== current.items) {
		return { ...current, items: nextItems };
	}

	return current;
}

export function patchProductImageCaches(
	queryClient: QueryClient,
	productId: string,
	patch: ProductImageCachePatch,
): void {
	queryClient.setQueryData(inventoryKeys.productDetail(productId), (current: any) =>
		patchProductRecord(current, productId, patch),
	);

	queryClient.setQueriesData({ queryKey: inventoryKeys.productsRoot() }, (current: any) =>
		patchInventoryListCache(current, productId, patch),
	);

	queryClient.setQueriesData({ queryKey: inventoryKeys.productsInfiniteRoot() }, (current: any) =>
		patchInventoryListCache(current, productId, patch),
	);
}