// BizAssist_api
// path: src/modules/inventory/inventory.repository.ts
import { Prisma, PrismaClient } from "@prisma/client";

type MovementCursor = { createdAt: Date; id: string };

export class InventoryRepository {
	constructor(private prisma: PrismaClient) {}

	async findByIdempotencyKey(businessId: string, idempotencyKey: string) {
		return this.prisma.inventoryMovement.findFirst({
			where: { businessId, idempotencyKey },
		});
	}

	async createMovementAndApplyStock(input: {
		businessId: string;
		productId: string;
		storeId?: string;
		quantityDelta: Prisma.Decimal;
		reason?: "SALE" | "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
		idempotencyKey: string;
		enforceNonNegative: boolean;
	}) {
		const reason = input.reason ?? "ADJUSTMENT";

		return this.prisma.$transaction(async (tx) => {
			const movement = await tx.inventoryMovement.create({
				data: {
					businessId: input.businessId,
					productId: input.productId,
					storeId: input.storeId ?? null,
					quantityDelta: input.quantityDelta,
					reason,
					idempotencyKey: input.idempotencyKey,
				},
			});

			if (input.enforceNonNegative) {
				const updatedCount = await tx.product.updateMany({
					where: {
						id: input.productId,
						businessId: input.businessId,
						...(input.quantityDelta.isNegative()
							? {
									onHandCached: {
										gte: input.quantityDelta.abs(),
									},
								}
							: {}),
					},
					data: {
						onHandCached: {
							increment: input.quantityDelta,
						},
						updatedAt: new Date(),
					},
				});

				if (updatedCount.count !== 1) {
					// Guard failed -> rollback
					throw new Prisma.PrismaClientKnownRequestError("Insufficient stock", {
						code: "P2000",
						clientVersion: "0",
					} as any);
				}
			} else {
				await tx.product.update({
					where: { id: input.productId },
					data: {
						onHandCached: { increment: input.quantityDelta },
						updatedAt: new Date(),
					},
				});
			}

			const product = await tx.product.findUnique({
				where: { id: input.productId },
				select: { id: true, onHandCached: true },
			});

			return { movement, product: product! };
		});
	}

	async getProductDetail(params: { businessId: string; productId: string; limit: number }) {
		const product = await this.prisma.product.findFirst({
			where: { id: params.productId, businessId: params.businessId },
			include: {
				unit: true,
				category: true,
				productModifierGroups: {
					orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
					select: {
						modifierGroupId: true,
						sortOrder: true,
					},
				},
				productOptionSets: {
					orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
					include: {
						optionSet: {
							select: {
								id: true,
								name: true,
								displayName: true,
								sortOrder: true,
							},
						},
					},
				},
				productVariations: {
					where: { isActive: true },
					orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
					include: {
						optionValues: {
							orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
							include: {
								optionSet: {
									select: {
										id: true,
										name: true,
										displayName: true,
										sortOrder: true,
									},
								},
								optionValue: {
									select: {
										id: true,
										value: true,
										sortOrder: true,
									},
								},
							},
						},
					},
				},
			},
		});

		const movements = await this.prisma.inventoryMovement.findMany({
			where: { businessId: params.businessId, productId: params.productId },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: params.limit,
		});

		return { product, movements };
	}

	async listMovementsPage(params: {
		businessId: string;
		productId: string;
		limit: number;
		cursor: MovementCursor | null;
	}) {
		const where: Prisma.InventoryMovementWhereInput = {
			businessId: params.businessId,
			productId: params.productId,
		};

		if (params.cursor) {
			where.OR = [
				{ createdAt: { lt: params.cursor.createdAt } },
				{ createdAt: params.cursor.createdAt, id: { lt: params.cursor.id } },
			];
		}

		return this.prisma.inventoryMovement.findMany({
			where,
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: params.limit,
		});
	}

	async listLowStock(params: { businessId: string; storeId?: string; limit: number; query?: string }) {
		// NOTE: Cross-field comparison (onHandCached <= reorderPoint) is not directly expressible
		// in Prisma without raw SQL. This keeps behavior compile-safe by filtering for reorderPoint != null
		// and returning values; service/UI can interpret low stock until you implement a raw query.
		return this.prisma.product.findMany({
			where: {
				businessId: params.businessId,
				isActive: true,
				trackInventory: true,
				...(params.storeId ? { storeId: params.storeId } : {}),
				...(params.query
					? {
							name: { contains: params.query, mode: "insensitive" },
						}
					: {}),
				reorderPoint: { not: null },
			},
			select: {
				id: true,
				name: true,
				sku: true,
				barcode: true,
				onHandCached: true,
				reorderPoint: true,
				primaryImageUrl: true,
				isActive: true,
			},
			orderBy: [{ updatedAt: "desc" }],
			take: params.limit,
		});
	}

	async sumSoldQtyByProduct(params: {
		businessId: string;
		since: Date;
		storeId?: string;
		limit: number;
		query?: string;
	}) {
		const rows = await this.prisma.saleLineItem.groupBy({
			by: ["productId"],
			where: {
				sale: {
					businessId: params.businessId,
					createdAt: { gte: params.since },
				},
				...(params.storeId ? { product: { storeId: params.storeId } } : {}),
				...(params.query
					? {
							productName: { contains: params.query, mode: "insensitive" },
						}
					: {}),
			},
			_sum: { quantityV2: true, quantity: true },
			orderBy: { _sum: { quantityV2: "desc" } },
			take: params.limit,
		});

		return rows.map((r) => ({
			productId: r.productId,
			soldQty: r._sum.quantityV2?.toString() ?? String(r._sum.quantity ?? 0),
		}));
	}

	async getProductsForReorder(params: { businessId: string; productIds: string[] }) {
		if (params.productIds.length === 0) return [];

		return this.prisma.product.findMany({
			where: {
				businessId: params.businessId,
				id: { in: params.productIds },
				isActive: true,
			},
			select: {
				id: true,
				name: true,
				sku: true,
				barcode: true,
				onHandCached: true,
				reorderPoint: true,
				primaryImageUrl: true,
			},
		});
	}

	async getWatermark(params: { businessId: string }) {
		const [p, m] = await this.prisma.$transaction([
			this.prisma.product.aggregate({
				where: { businessId: params.businessId },
				_max: { updatedAt: true },
			}),
			this.prisma.inventoryMovement.aggregate({
				where: { businessId: params.businessId },
				_max: { createdAt: true },
			}),
		]);

		return {
			lastProductUpdatedAt: p._max.updatedAt ?? null,
			lastInventoryMovementAt: m._max.createdAt ?? null,
		};
	}
}
