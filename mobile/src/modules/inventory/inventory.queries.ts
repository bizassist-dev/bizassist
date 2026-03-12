// BizAssist_mobile path: src/modules/inventory/inventory.queries.ts
export const inventoryKeys = {
	all: ["inventory"] as const,

	productsRoot: () => [...inventoryKeys.all, "products"] as const,
	products: (q: string, opts?: { includeArchived?: boolean }) =>
		[...inventoryKeys.productsRoot(), { q, includeArchived: opts?.includeArchived ?? false }] as const,
	productsInfiniteRoot: () => [...inventoryKeys.productsRoot(), "infinite"] as const,
	productsInfinite: (q: string, opts?: { includeArchived?: boolean }) =>
		[...inventoryKeys.productsInfiniteRoot(), { q, includeArchived: opts?.includeArchived ?? false }] as const,

	productDetailRoot: () => [...inventoryKeys.all, "product"] as const,
	productDetail: (id: string) => [...inventoryKeys.productDetailRoot(), id] as const,

	movementsRoot: () => [...inventoryKeys.all, "movements"] as const,
	movements: (productId: string, limit: number) => [...inventoryKeys.movementsRoot(), { productId, limit }] as const,
};
