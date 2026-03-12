export type RealtimeEvent =
	| {
			type: "realtime.ready";
			businessId: string;
			occurredAt: string;
	  }
	| {
			type: "catalog.product.changed" | "inventory.stock.changed";
			businessId: string;
			productId?: string;
			productIds?: string[];
			occurredAt: string;
	  };
