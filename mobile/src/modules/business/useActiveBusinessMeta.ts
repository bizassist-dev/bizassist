// path: src/modules/business/useActiveBusinessMeta.ts

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { businessApi } from "@/modules/business/business.api";
import { metaApi } from "@/modules/meta/meta.api";

import type { ActiveBusinessContext, ApiEnvelope } from "@/modules/business/business.types";
import type { CountryMeta } from "@/modules/meta/meta.types";

function normalizeISO2(cc?: string | null): string {
	return (cc ?? "").trim().toUpperCase();
}

function normalizeCurrency(cur?: string | null): string {
	return (cur ?? "").trim().toUpperCase();
}

function safeString(v: unknown): string {
	return typeof v === "string" ? v : "";
}

export type ActiveBusinessMeta = {
	// Fetch status
	isLoading: boolean;
	isError: boolean;

	// Controls
	refetch: () => void;

	// Presence gate
	hasBusiness: boolean;
	businessId: string;

	// Core display fields (already normalized)
	businessName: string;
	countryCode: string;
	countryName: string;
	countryLabel: string;
	currencyCode: string;
	timezone: string;

	// Optional context
	storeName: string;
};

export function useActiveBusinessMeta(): ActiveBusinessMeta {
	// 1) Active business context (authoritative)
	const activeQuery = useQuery<ApiEnvelope<ActiveBusinessContext>>({
		queryKey: ["business", "active"],
		queryFn: () => businessApi.getActiveBusiness(),
		staleTime: 120_000,
	});

	// 2) Countries meta (for mapping code -> name)
	const countriesQuery = useQuery<CountryMeta[]>({
		queryKey: ["meta", "countries"],
		queryFn: async () => {
			const res = await metaApi.getCountries();
			return res.data ?? [];
		},
		staleTime: 24 * 60 * 60 * 1000,
	});

	const refetch = useCallback(() => {
		activeQuery.refetch();
		countriesQuery.refetch();
	}, [activeQuery, countriesQuery]);

	const ctx = activeQuery.data?.success ? activeQuery.data.data : null;

	const activeBusiness = ctx?.activeBusiness ?? null;

	// Naming drift tolerance
	const defaultStore = ctx?.defaultStore ?? ctx?.activeStore ?? null;

	const countries = useMemo(() => countriesQuery.data ?? [], [countriesQuery.data]);

	const derived = useMemo(() => {
		const hasBusiness = Boolean(activeBusiness?.id);
		const businessId = safeString(activeBusiness?.id);

		const businessName = safeString(activeBusiness?.name);

		const countryCode = normalizeISO2((activeBusiness as any)?.countryCode ?? (activeBusiness as any)?.country);

		const countryName =
			countryCode && countries.length
				? (countries.find((c) => normalizeISO2(c.countryCode) === countryCode)?.name ?? "")
				: "";

		const countryLabel =
			countryName && countryCode ? `${countryName} (${countryCode})` : countryCode ? countryCode : "—";

		const currencyCode = normalizeCurrency(
			safeString((activeBusiness as any)?.currencyCode) ||
				safeString((activeBusiness as any)?.settings?.currency) ||
				safeString((activeBusiness as any)?.settings?.currencyCode),
		);

		const timezone = safeString((activeBusiness as any)?.timezone);

		const storeName = safeString(defaultStore?.name) || "Main Store";

		return {
			hasBusiness,
			businessId,
			businessName,
			countryCode,
			countryName,
			countryLabel,
			currencyCode,
			timezone,
			storeName,
		};
	}, [activeBusiness, countries, defaultStore]);

	return {
		isLoading: activeQuery.isLoading || countriesQuery.isLoading,
		isError: activeQuery.isError || countriesQuery.isError,
		refetch,

		hasBusiness: derived.hasBusiness,
		businessId: derived.businessId,
		businessName: derived.businessName,
		countryCode: derived.countryCode,
		countryName: derived.countryName,
		countryLabel: derived.countryLabel,
		currencyCode: derived.currencyCode,
		timezone: derived.timezone,
		storeName: derived.storeName,
	};
}
