import { publishRealtimeEventToCluster } from "@/modules/realtime/realtime.postgres";

export function publishCatalogProductChanged(args: { businessId: string; productId?: string; productIds?: string[] }): void {
	publishRealtimeEventToCluster({
		type: "catalog.product.changed",
		businessId: args.businessId,
		productId: args.productId,
		productIds: args.productIds,
	});
}

export function publishInventoryStockChanged(args: { businessId: string; productId?: string; productIds?: string[] }): void {
	publishRealtimeEventToCluster({
		type: "inventory.stock.changed",
		businessId: args.businessId,
		productId: args.productId,
		productIds: args.productIds,
	});
}
