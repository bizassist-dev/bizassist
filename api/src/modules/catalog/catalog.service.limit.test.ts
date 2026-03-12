import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { StatusCodes } from "http-status-codes";
import { ProductType, UnitCategory } from "@prisma/client";

import { CatalogService } from "@/modules/catalog/catalog.service";
import { MAX_PRODUCTS_PER_BUSINESS } from "@/shared/catalogLimits";

jest.mock("@/lib/prisma", () => ({
	prisma: {},
}));

jest.mock("@/modules/units/units.repository", () => {
	const mockGetBusinessUnitById = jest.fn<() => Promise<any | null>>();

	return {
		UnitsRepository: jest.fn().mockImplementation(() => ({
			getBusinessUnitById: mockGetBusinessUnitById,
		})),
		mockGetBusinessUnitById,
	};
});

jest.mock("@/modules/media/media.resolve", () => ({
	resolveProductImageUrl: jest.fn(async (value: string | null) => value),
}));

function getMockedUnitLookup() {
	return (
		jest.requireMock("@/modules/units/units.repository") as {
			mockGetBusinessUnitById: jest.Mock<() => Promise<any | null>>;
		}
	).mockGetBusinessUnitById;
}

describe("CatalogService safety ceiling", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		getMockedUnitLookup().mockReset();
	});

	test("rejects create when business catalog ceiling is reached", async () => {
		const service = new CatalogService();
		const countProductsByBusiness = jest.fn<() => Promise<number>>().mockResolvedValue(MAX_PRODUCTS_PER_BUSINESS);

		(service as any).repo = {
			countProductsByBusiness,
		};

		await expect(
			service.createProduct("biz_123", {
				type: "PHYSICAL",
				name: "Safety Test Item",
			} as any),
		).rejects.toMatchObject({
			statusCode: StatusCodes.CONFLICT,
			code: "CATALOG_LIMIT_REACHED",
			message: "Catalog limit reached. Contact support.",
		});
	});

	test("normalizes service create input without mutating the caller payload", async () => {
		getMockedUnitLookup().mockResolvedValue({
			id: "unit_time",
			isActive: true,
			category: UnitCategory.TIME,
			precisionScale: 0,
		});

		const service = new CatalogService();
		const createProductWithInitialStock = jest.fn(async ({ product, initialOnHand }: any) => ({
			...product,
			category: null,
			reorderPoint: product.reorderPoint ?? null,
			onHandCached: "0",
			initialOnHand,
			primaryImageUrl: null,
			posTileMode: product.posTileMode ?? "COLOR",
			posTileColor: product.posTileColor ?? null,
			posTileLabel: product.posTileLabel ?? null,
			isActive: true,
			id: "prod_123",
			createdAt: new Date("2026-03-12T00:00:00.000Z"),
			updatedAt: new Date("2026-03-12T00:00:00.000Z"),
		}));

		(service as any).repo = {
			countProductsByBusiness: jest.fn<() => Promise<number>>().mockResolvedValue(0),
			findProductBySku: jest.fn<() => Promise<any | null>>().mockResolvedValue(null),
			findProductByBarcode: jest.fn<() => Promise<any | null>>().mockResolvedValue(null),
			createProductWithInitialStock,
		};

		const input = {
			type: ProductType.SERVICE,
			name: "Consultation",
			sku: "SERV-001",
			unitId: "unit_time",
			trackInventory: true,
			reorderPoint: "4",
			initialOnHand: "2",
			processingEnabled: false,
			durationInitialMinutes: 15,
			durationFinalMinutes: 15,
		};
		const originalInput = { ...input };

		const result = await service.createProduct("biz_123", input);

		expect(input).toEqual(originalInput);
		expect(createProductWithInitialStock).toHaveBeenCalledWith(
			expect.objectContaining({
				initialOnHand: null,
				modifierGroupIds: undefined,
				product: expect.objectContaining({
					unitId: "unit_time",
					trackInventory: false,
					reorderPoint: null,
					durationTotalMinutes: 30,
					serviceDurationMins: 30,
					processingEnabled: false,
					durationProcessingMinutes: 0,
				}),
			}),
		);
		expect(result.trackInventory).toBe(false);
		expect(result.reorderPoint).toBeNull();
		expect(result.durationTotalMinutes).toBe(30);
	});
});
