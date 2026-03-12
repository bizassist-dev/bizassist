// path: src/modules/catalog/catalog.controller.ts
import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";
import catalogService from "./catalog.service";
import type {
	CreateProductInput,
	GenerateProductVariationsInput,
	PreviewProductVariationsInput,
	SyncManualProductVariationsInput,
	UpdateProductInput,
} from "./catalog.types";
import { listProductsQuerySchema } from "./catalog.validators";

import { respondWithEtagJson } from "@/shared/http/etagResponse";
import { publishCatalogProductChanged } from "@/modules/realtime/realtime.events";

function getBusinessId(req: Request): string {
	return req.user!.activeBusinessId!;
}

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const query = listProductsQuerySchema.parse(req.query);

	const result = await catalogService.listProducts(businessId, query);

	const payload = { success: true, data: result };
	respondWithEtagJson(req, res, payload, StatusCodes.OK);
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const id = String(req.params.id);

	const product = await catalogService.getProduct(businessId, id);
	res.status(StatusCodes.OK).json({ success: true, data: product });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);

	// validateBody(createProductSchema) guarantees shape.
	const input = req.body as CreateProductInput;

	const product = await catalogService.createProduct(businessId, input);
	publishCatalogProductChanged({ businessId, productId: product.id });
	res.status(StatusCodes.CREATED).json({ success: true, data: product });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const id = String(req.params.id);

	// validateBody(updateProductSchema) guarantees shape.
	const input = req.body as UpdateProductInput;

	const product = await catalogService.updateProduct(businessId, id, input);
	publishCatalogProductChanged({ businessId, productId: product.id });
	res.status(StatusCodes.OK).json({ success: true, data: product });
});

export const getCatalogWatermark = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);

	const data = await catalogService.getWatermark(businessId);
	res.status(StatusCodes.OK).json({ success: true, data });
});

export const previewProductVariations = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const productId = String(req.params.id);
	const input = req.body as PreviewProductVariationsInput;

	const data = await catalogService.previewProductVariations(businessId, productId, input);
	res.status(StatusCodes.OK).json({ success: true, data });
});

export const generateProductVariations = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const productId = String(req.params.id);
	const input = req.body as GenerateProductVariationsInput;

	const data = await catalogService.generateProductVariations(businessId, productId, input);
	publishCatalogProductChanged({ businessId, productId });
	res.status(StatusCodes.OK).json({ success: true, data });
});

export const syncManualProductVariations = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const productId = String(req.params.id);
	const input = req.body as SyncManualProductVariationsInput;

	const data = await catalogService.syncManualProductVariations(businessId, productId, input);
	publishCatalogProductChanged({ businessId, productId });
	res.status(StatusCodes.OK).json({ success: true, data });
});
