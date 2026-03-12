// path: src/modules/inventory/inventory.controller.ts
import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";

import { inventoryService } from "./inventory.service";
import { normalizeIdempotencyKey, type InventoryAdjustmentInput } from "./inventory.validators";

import { respondWithEtagJson } from "@/shared/http/etagResponse";
import { publishCatalogProductChanged, publishInventoryStockChanged } from "@/modules/realtime/realtime.events";

function getBusinessId(req: Request): string {
	return req.user!.activeBusinessId!;
}

function clampInt(
	value: unknown,
	{ min, max, fallback }: { min: number; max: number; fallback: number }
): number {
	const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function getOptionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveIdempotencyKey(req: Request, input: InventoryAdjustmentInput): string | undefined {
	return (
		input.idempotencyKey ??
		normalizeIdempotencyKey(req.header("idempotency-key")) ??
		normalizeIdempotencyKey(req.header("x-idempotency-key"))
	);
}

export const adjustStock = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const input = req.body as InventoryAdjustmentInput;

	const idempotencyKey = resolveIdempotencyKey(req, input);
	const result = await inventoryService.adjustStock(businessId, { ...input, idempotencyKey });
	publishInventoryStockChanged({ businessId, productId: input.productId });
	res.status(StatusCodes.OK).json({ success: true, data: result });
});

export const getInventoryProductDetail = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const productId = String(req.params.id);

	const data = await inventoryService.getInventoryProductDetail(businessId, productId);
	res.status(StatusCodes.OK).json({ success: true, data });
});

export const listInventoryMovements = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const productId = String(req.params.id);

	const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 50 });
	const cursor = getOptionalString(req.query.cursor);

	const data = await inventoryService.listMovementsPage(businessId, productId, { limit, cursor });
	const payload = { success: true, data };
	respondWithEtagJson(req, res, payload, StatusCodes.OK);
});

export const listLowStock = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);

	const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 50 });
	const storeId = getOptionalString(req.query.storeId);
	const q = getOptionalString(req.query.q);

	const data = await inventoryService.listLowStock(businessId, { limit, storeId, q });

	const payload = { success: true, data };
	respondWithEtagJson(req, res, payload, StatusCodes.OK);
});

export const listReorderSuggestions = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);

	const days = clampInt(req.query.days, { min: 7, max: 90, fallback: 30 });
	const leadDays = clampInt(req.query.leadDays, { min: 1, max: 30, fallback: 7 });
	const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 50 });

	const storeId = getOptionalString(req.query.storeId);
	const q = getOptionalString(req.query.q);

	const data = await inventoryService.listReorderSuggestions(businessId, { days, leadDays, limit, storeId, q });

	const payload = { success: true, data };
	respondWithEtagJson(req, res, payload, StatusCodes.OK);
});

export const removeInventoryProductImage = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const productId = String(req.params.id);

	const data = await inventoryService.removeProductPrimaryImage(businessId, productId);
	publishCatalogProductChanged({ businessId, productId });
	res.status(StatusCodes.OK).json({ success: true, data });
});

export const getInventoryWatermark = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const data = await inventoryService.getWatermark(businessId);

	const payload = { success: true, data };
	respondWithEtagJson(req, res, payload, StatusCodes.OK);
});
