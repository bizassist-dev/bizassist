import { queryClient } from "@/lib/queryClient";
import { MMKVKeys, mmkv } from "@/lib/storage/mmkv";
import { clearDiscountSelection } from "@/modules/discounts/discounts.selectionStore";
import { clearPendingQuantityEdit } from "@/modules/pos/pos.quantityEditStore";

const SESSION_SCOPED_STORAGE_KEYS = [
	MMKVKeys.activeBusinessId,
	"activeBusinessId",
	"business.activeBusinessId",
	"activeBusiness",
	"business.activeBusiness",
] as const;

export function clearSessionScopedClientState(): void {
	clearPendingQuantityEdit();
	clearDiscountSelection();

	for (const key of SESSION_SCOPED_STORAGE_KEYS) {
		mmkv.remove(key);
	}

	void queryClient.cancelQueries();
	queryClient.clear();
}