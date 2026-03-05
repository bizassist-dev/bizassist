// path: src/modules/catalog/catalog.routes.ts
import { Router } from "express";

import { authMiddleware } from "@/core/middleware/auth";
import { requireActiveBusiness } from "@/core/middleware/requireActiveBusiness";
import { validateBody } from "@/shared/middleware/validateBody";

import {
	listProducts,
	getProduct,
	createProduct,
	updateProduct,
	getCatalogWatermark,
	previewProductVariations,
	generateProductVariations,
	syncManualProductVariations,
} from "./catalog.controller";
import {
	createProductSchema,
	updateProductSchema,
	previewProductVariationsSchema,
	generateProductVariationsSchema,
	syncManualProductVariationsSchema,
} from "./catalog.validators";

const router = Router();

router.use(authMiddleware);
router.use(requireActiveBusiness);

// Offline-first change signal
router.get("/watermark", getCatalogWatermark);

// Catalog
router.get("/products", listProducts);
router.get("/products/:id", getProduct);
router.post("/products", validateBody(createProductSchema), createProduct);
router.patch("/products/:id", validateBody(updateProductSchema), updateProduct);
router.post("/products/:id/variations/preview", validateBody(previewProductVariationsSchema), previewProductVariations);
router.post(
	"/products/:id/variations/generate",
	validateBody(generateProductVariationsSchema),
	generateProductVariations,
);
router.post(
	"/products/:id/variations/manual-sync",
	validateBody(syncManualProductVariationsSchema),
	syncManualProductVariations,
);

export const catalogRoutes = router;
