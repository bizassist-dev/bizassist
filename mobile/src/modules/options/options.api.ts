import apiClient from "@/lib/api/httpClient";
import type { OptionSet } from "./options.types";

type VariationSelectionInput = {
	optionSetId: string;
	optionValueIds: string[];
};

type VariationPreviewItem = {
	variationKey: string;
	label: string;
	valueMap: Record<string, string>;
	sortOrder: number;
};

export const optionsApi = {
	async list(includeArchived = false): Promise<OptionSet[]> {
		const res = await apiClient.get<{ success: true; data: { items: OptionSet[] } }>("/catalog/options", {
			params: includeArchived ? { includeArchived: 1 } : undefined,
		});
		return res.data.data.items ?? [];
	},

	async get(id: string): Promise<OptionSet> {
		const res = await apiClient.get<{ success: true; data: { item: OptionSet } }>(
			`/catalog/options/${encodeURIComponent(id)}`,
		);
		return res.data.data.item;
	},

	async createOptionSet(input: { name: string; displayName?: string; sortOrder?: number }): Promise<OptionSet> {
		const res = await apiClient.post<{ success: true; data: { item: OptionSet } }>("/catalog/options", input);
		return res.data.data.item;
	},

	async updateOptionSet(
		id: string,
		input: { name?: string; displayName?: string; sortOrder?: number },
	): Promise<OptionSet> {
		const res = await apiClient.patch<{ success: true; data: { item: OptionSet } }>(
			`/catalog/options/${encodeURIComponent(id)}`,
			input,
		);
		return res.data.data.item;
	},

	async archiveOptionSet(id: string): Promise<void> {
		await apiClient.post(`/catalog/options/${encodeURIComponent(id)}/archive`);
	},

	async restoreOptionSet(id: string): Promise<void> {
		await apiClient.post(`/catalog/options/${encodeURIComponent(id)}/restore`);
	},

	async addOptionValue(optionSetId: string, input: { name: string; sortOrder?: number }): Promise<OptionSet> {
		const res = await apiClient.post<{ success: true; data: { item: OptionSet } }>(
			`/catalog/options/${encodeURIComponent(optionSetId)}/values`,
			input,
		);
		return res.data.data.item;
	},

	async updateOptionValue(id: string, input: { name?: string; sortOrder?: number }): Promise<OptionSet> {
		const res = await apiClient.patch<{ success: true; data: { item: OptionSet } }>(
			`/catalog/options/values/${encodeURIComponent(id)}`,
			input,
		);
		return res.data.data.item;
	},

	async archiveOptionValue(id: string): Promise<OptionSet> {
		const res = await apiClient.post<{ success: true; data: { item: OptionSet } }>(
			`/catalog/options/values/${encodeURIComponent(id)}/archive`,
		);
		return res.data.data.item;
	},

	async restoreOptionValue(id: string): Promise<OptionSet> {
		const res = await apiClient.post<{ success: true; data: { item: OptionSet } }>(
			`/catalog/options/values/${encodeURIComponent(id)}/restore`,
		);
		return res.data.data.item;
	},

	async previewProductVariations(
		productId: string,
		input: { selections: VariationSelectionInput[] },
	): Promise<{
		items: VariationPreviewItem[];
		total: number;
		warning: boolean;
	}> {
		const res = await apiClient.post<{
			success: true;
			data: { items: VariationPreviewItem[]; total: number; warning: boolean };
		}>(`/catalog/products/${encodeURIComponent(productId)}/variations/preview`, input);
		return res.data.data;
	},

	async generateProductVariations(
		productId: string,
		input: { selections: VariationSelectionInput[]; selectedVariationKeys?: string[] },
	): Promise<{ count: number }> {
		const res = await apiClient.post<{ success: true; data: { count: number } }>(
			`/catalog/products/${encodeURIComponent(productId)}/variations/generate`,
			input,
		);
		return res.data.data;
	},

	async syncManualProductVariations(
		productId: string,
		input: { variations: { variationKey: string; label: string; sortOrder?: number }[] },
	): Promise<{ count: number }> {
		const res = await apiClient.post<{ success: true; data: { count: number } }>(
			`/catalog/products/${encodeURIComponent(productId)}/variations/manual-sync`,
			input,
		);
		return res.data.data;
	},
};
