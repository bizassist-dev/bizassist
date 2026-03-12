import { describe, expect, test } from "@jest/globals";
import { ProductType } from "@prisma/client";

import { createProductSchema } from "@/modules/catalog/catalog.validators";

describe("createProductSchema service rules", () => {
	test("requires unitId for service creates", () => {
		const result = createProductSchema.safeParse({
			type: ProductType.SERVICE,
			name: "Consultation",
			processingEnabled: false,
			durationInitialMinutes: 15,
			durationFinalMinutes: 15,
		});

		expect(result.success).toBe(false);
		if (result.success) return;

		expect(result.error.flatten().fieldErrors.unitId).toContain("unitId is required for services.");
	});

	test("accepts service creates when unitId and duration fields are present", () => {
		const result = createProductSchema.safeParse({
			type: ProductType.SERVICE,
			name: "Consultation",
			unitId: "550e8400-e29b-41d4-a716-446655440000",
			processingEnabled: true,
			durationInitialMinutes: 15,
			durationProcessingMinutes: 30,
			durationFinalMinutes: 15,
		});

		expect(result.success).toBe(true);
	});
});