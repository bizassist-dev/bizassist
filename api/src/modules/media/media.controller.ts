// path: src/modules/media/media.controller.ts (API)
import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";

import {
	createSignedUploadSchema,
	commitUploadedObjectSchema,
	removeProductPrimaryImageSchema,
} from "@/modules/media/media.validators";
import { createSignedUploadUrl, commitUploadedObject, removeProductPrimaryImage } from "@/modules/media/media.service";
import { publishCatalogProductChanged } from "@/modules/realtime/realtime.events";

type RequestUser = {
	id: string;
	email: string;
	activeBusinessId?: string | null;
	role?: string;
};

type AuthedRequest = Request & { user?: RequestUser };

type ApiEnvelope<T> =
	| { success: true; data: T; message?: string }
	| { success: false; error: { code: string; message?: string } };

function ok<T>(res: Response, data: T, status = StatusCodes.OK) {
	res.status(status).json({ success: true, data } satisfies ApiEnvelope<T>);
}

export const postCreateSignedUpload = asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
	const user = req.user;
	if (!user) {
		res
			.status(StatusCodes.UNAUTHORIZED)
			.json({ success: false, error: { code: "UNAUTHORIZED" } } satisfies ApiEnvelope<never>);
		return;
	}

	const dto = createSignedUploadSchema.parse(req.body);

	const result = await createSignedUploadUrl(
		{
			id: user.id,
			activeBusinessId: user.activeBusinessId ?? null,
		},
		dto,
	);

	ok(res, result);
});

export const postCommitUploadedObject = asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
	const user = req.user;
	if (!user) {
		res
			.status(StatusCodes.UNAUTHORIZED)
			.json({ success: false, error: { code: "UNAUTHORIZED" } } satisfies ApiEnvelope<never>);
		return;
	}

	const dto = commitUploadedObjectSchema.parse(req.body);

	const result = await commitUploadedObject(
		{
			id: user.id,
			activeBusinessId: user.activeBusinessId ?? null,
		},
		dto,
	);
	if (user.activeBusinessId && dto.productId) {
		publishCatalogProductChanged({ businessId: user.activeBusinessId, productId: dto.productId });
	}

	ok(res, result);
});

export const postRemoveProductPrimaryImage = asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
	const user = req.user;
	if (!user) {
		res
			.status(StatusCodes.UNAUTHORIZED)
			.json({ success: false, error: { code: "UNAUTHORIZED" } } satisfies ApiEnvelope<never>);
		return;
	}

	const dto = removeProductPrimaryImageSchema.parse(req.body);

	const result = await removeProductPrimaryImage(
		{
			id: user.id,
			activeBusinessId: user.activeBusinessId ?? null,
		},
		dto,
	);
	if (user.activeBusinessId && dto.productId) {
		publishCatalogProductChanged({ businessId: user.activeBusinessId, productId: dto.productId });
	}

	ok(res, result);
});
