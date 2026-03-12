// BizAssist_mobile
// path: src/modules/discounts/discounts.navigation.ts
//
// Navigation governance helpers for Discounts flows:
// - PROCESS screens: exit deterministically (returnTo override).
// - DETAIL screens: back uses history with deterministic fallback.

const INVENTORY_ROOT_ROUTE = "/(app)/(tabs)/inventory" as const;
export const INVENTORY_DISCOUNTS_LEDGER_ROUTE = "/(app)/(tabs)/inventory/discounts/discount.ledger" as const;
export const INVENTORY_DISCOUNTS_CREATE_ROUTE = "/(app)/(tabs)/inventory/discounts/create" as const;
export const SETTINGS_DISCOUNTS_LEDGER_ROUTE = "/(app)/(tabs)/settings/discounts" as const;
export const SETTINGS_DISCOUNTS_CREATE_ROUTE = "/(app)/(tabs)/settings/discounts/create" as const;

export type DiscountFlowMode = "settings" | "inventory";

const DISCOUNT_LEDGER_ROUTE_BY_MODE: Record<DiscountFlowMode, string> = {
	settings: SETTINGS_DISCOUNTS_LEDGER_ROUTE,
	inventory: INVENTORY_DISCOUNTS_LEDGER_ROUTE,
};

const DISCOUNT_CREATE_ROUTE_BY_MODE: Record<DiscountFlowMode, string> = {
	settings: SETTINGS_DISCOUNTS_CREATE_ROUTE,
	inventory: INVENTORY_DISCOUNTS_CREATE_ROUTE,
};

const DISCOUNT_FLOW_EXIT_ROUTE_BY_MODE: Record<DiscountFlowMode, string> = {
	settings: SETTINGS_DISCOUNTS_LEDGER_ROUTE,
	inventory: INVENTORY_ROOT_ROUTE,
};

export function appendReturnToQuery(route: string, returnTo: string | null): string {
	if (!returnTo) return route;
	const encoded = encodeURIComponent(returnTo);
	const separator = route.includes("?") ? "&" : "?";
	return `${route}${separator}returnTo=${encoded}`;
}

export function normalizeReturnTo(raw: unknown): string | null {
	const value = String(raw ?? "").trim();
	if (!value) return null;
	if (!value.startsWith("/")) return null;
	if (value === "undefined" || value === "null") return null;
	return value;
}

export function normalizeDiscountReturnTo(raw: unknown): string | null {
	return normalizeReturnTo(raw);
}

export function buildDiscountLedgerRoute(mode: DiscountFlowMode, returnTo: string | null = null): string {
	return appendReturnToQuery(DISCOUNT_LEDGER_ROUTE_BY_MODE[mode], returnTo);
}

export function buildDiscountCreateRoute(mode: DiscountFlowMode, returnTo: string | null = null): string {
	return appendReturnToQuery(DISCOUNT_CREATE_ROUTE_BY_MODE[mode], returnTo);
}

export function buildDiscountDetailsRoute(
	mode: DiscountFlowMode,
	discountId: string,
	returnTo: string | null = null,
): string {
	const id = String(discountId ?? "").trim();
	if (!id) return buildDiscountLedgerRoute(mode, returnTo);

	const base =
		mode === "settings"
			? `/(app)/(tabs)/settings/discounts/${encodeURIComponent(id)}`
			: `/(app)/(tabs)/inventory/discounts/${encodeURIComponent(id)}`;
	return appendReturnToQuery(base, returnTo);
}

export function buildDiscountEditRoute(mode: DiscountFlowMode, discountId: string, returnTo: string | null = null): string {
	const id = String(discountId ?? "").trim();
	if (!id) return buildDiscountLedgerRoute(mode, returnTo);

	const base =
		mode === "settings"
			? `/(app)/(tabs)/settings/discounts/${encodeURIComponent(id)}/edit`
			: `/(app)/(tabs)/inventory/discounts/${encodeURIComponent(id)}/edit`;
	return appendReturnToQuery(base, returnTo);
}

export function resolveDiscountFlowExitRoute(mode: DiscountFlowMode, returnTo: string | null): string {
	return returnTo ?? DISCOUNT_FLOW_EXIT_ROUTE_BY_MODE[mode];
}

export function resolveDiscountCreateExitRoute(mode: DiscountFlowMode, returnTo: string | null): string {
	return returnTo ?? DISCOUNT_LEDGER_ROUTE_BY_MODE[mode];
}

export function resolveDiscountDetailBackFallbackRoute(mode: DiscountFlowMode, returnTo: string | null): string {
	return buildDiscountLedgerRoute(mode, returnTo);
}

export function resolveDiscountDetailRoute(mode: DiscountFlowMode, discountId: string, returnTo: string | null): string {
	return buildDiscountDetailsRoute(mode, discountId, returnTo);
}

export function resolveDiscountEditExitRoute(mode: DiscountFlowMode, returnTo: string | null, discountId: string): string {
	return resolveDiscountDetailRoute(mode, discountId, returnTo);
}

export function resolveDiscountEditSaveRoute(mode: DiscountFlowMode, returnTo: string | null): string {
	return buildDiscountLedgerRoute(mode, returnTo);
}

export function resolveDiscountCreateSuccessRoute(
	mode: DiscountFlowMode,
	discountId: string,
	returnTo: string | null,
): string {
	if (returnTo) return resolveDiscountCreateExitRoute(mode, returnTo);
	return buildDiscountDetailsRoute(mode, discountId, null);
}

export function buildSettingsDiscountLedgerRoute(returnTo: string | null = null): string {
	return buildDiscountLedgerRoute("settings", returnTo);
}

export function buildSettingsDiscountCreateRoute(returnTo: string | null = null): string {
	return buildDiscountCreateRoute("settings", returnTo);
}

export function buildSettingsDiscountDetailsRoute(discountId: string, returnTo: string | null = null): string {
	return buildDiscountDetailsRoute("settings", discountId, returnTo);
}

export function buildSettingsDiscountEditRoute(discountId: string, returnTo: string | null = null): string {
	return buildDiscountEditRoute("settings", discountId, returnTo);
}

export function resolveSettingsDiscountFlowExitRoute(returnTo: string | null): string {
	return resolveDiscountFlowExitRoute("settings", returnTo);
}

export function resolveSettingsDiscountDetailBackFallbackRoute(returnTo: string | null): string {
	return resolveDiscountDetailBackFallbackRoute("settings", returnTo);
}

export function buildInventoryDiscountLedgerRoute(returnTo: string | null = null): string {
	return buildDiscountLedgerRoute("inventory", returnTo);
}

export function buildInventoryDiscountCreateRoute(returnTo: string | null = null): string {
	return buildDiscountCreateRoute("inventory", returnTo);
}

export function buildInventoryDiscountDetailsRoute(discountId: string, returnTo: string | null = null): string {
	return buildDiscountDetailsRoute("inventory", discountId, returnTo);
}

export function buildInventoryDiscountEditRoute(discountId: string, returnTo: string | null = null): string {
	return buildDiscountEditRoute("inventory", discountId, returnTo);
}

export function resolveInventoryDiscountFlowExitRoute(returnTo: string | null): string {
	return resolveDiscountFlowExitRoute("inventory", returnTo);
}

export function resolveInventoryDiscountCreateExitRoute(returnTo: string | null): string {
	return resolveDiscountCreateExitRoute("inventory", returnTo);
}

export function resolveInventoryDiscountEditExitRoute(returnTo: string | null, discountId: string): string {
	return resolveDiscountEditExitRoute("inventory", returnTo, discountId);
}

export function resolveInventoryDiscountDetailBackFallbackRoute(returnTo: string | null): string {
	return resolveDiscountDetailBackFallbackRoute("inventory", returnTo);
}
