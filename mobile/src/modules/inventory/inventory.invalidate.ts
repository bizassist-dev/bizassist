// BizAssist_mobile path: src/modules/inventory/inventory.invalidate.ts
import { catalogKeys } from "@/modules/catalog/catalog.queries";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Canonical invalidation targets after any inventory mutation.
 * - Re-fetch list (search results)
 * - Re-fetch detail + movements (if product is known)
 */
export function invalidateInventoryAfterMutation(qc: QueryClient, opts?: { productId?: string }) {
	qc.invalidateQueries({ queryKey: inventoryKeys.productsRoot() });
	qc.invalidateQueries({ queryKey: catalogKeys.all });
	qc.invalidateQueries({ queryKey: ["pos", "catalog", "products"] });

	if (opts?.productId) {
		qc.invalidateQueries({ queryKey: inventoryKeys.productDetail(opts.productId) });
		qc.invalidateQueries({ queryKey: inventoryKeys.movementsRoot() });
	}
}
