import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";

import type { CheckoutInput } from "./pos.types";
import { checkout } from "./pos.service";
import { publishInventoryStockChanged } from "@/modules/realtime/realtime.events";

function getBusinessId(req: Request): string {
	// Canonical: authMiddleware + requireActiveBusiness populate req.user.activeBusinessId
	return req.user!.activeBusinessId!;
}

function getUserId(req: Request): string {
	return req.user!.id;
}

export const handleCheckout = asyncHandler(async (req: Request, res: Response) => {
	const businessId = getBusinessId(req);
	const userId = getUserId(req);
	const input = req.body as CheckoutInput;

	// ✅ pos.service.checkout expects a single args object
	const result = await checkout({
		activeBusinessId: businessId,
		userId,
		input,
	});
	publishInventoryStockChanged({
		businessId,
		productIds: result.sale.lineItems.map((lineItem) => lineItem.productId),
	});

	res.status(StatusCodes.OK).json({ success: true, data: result });
});
