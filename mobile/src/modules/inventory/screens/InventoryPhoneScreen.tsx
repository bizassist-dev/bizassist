// BizAssist_mobile
// path: src/modules/inventory/screens/InventoryPhoneScreen.tsx
//
// Refactor (Masterplan - Inventory Header Governance):
// - Remove standalone count badge rows (no “pill clouds”)
// - Embed counts directly into tabs:
//   1) Sellable Type: Items / Services (counts)
//   2) Stock Health: All / In / Low / Out (counts) — Items only
// - Keep server search (q) and apply tab filtering client-side
// - Preserve kiss layout, keyboard avoidance + dismissal
// - Use SearchBar inline clear affordance (no extra “Clear Search” row)
// - Scrollable Screen Layout Governance: keep one vertical scroll owner (FlatList)
//   behind a minHeight:0 flex chain from BAIScreen -> governed scroll area -> list.
//
// Capability Alignment
// Capability:
// - Catalog Management
// - Inventory Management
// Sub Capability:
// - Item Management
// - Service Management
// - Inventory Activity
// Owner Surface:
// - mobile/app/(app)/(tabs)/inventory/inventory.phone.tsx
// - mobile/src/modules/inventory/screens/InventoryPhoneScreen.tsx
// Domain Entities:
// - Product
// - Category
// - Unit
// - InventoryMovement
// System Invariants:
// - archive-only lifecycle (no hard delete)
// - business scoping required for all queries and mutations
// - stock-health filters are applied to active, inventory-tracked items only
// - this list screen is read model + navigation shell; stock mutations occur in dedicated ledger flows

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, FlatList, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAIGovernedScrollableLayout } from "@/components/ui/BAIGovernedScrollableLayout";
import { BAIText } from "@/components/ui/BAIText";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIEmptyStateButton } from "@/components/ui/BAIEmptyStateButton";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIGroupTabs, type BAIGroupTab } from "@/components/ui/BAIGroupTabs";

import { InventorySearchBar } from "@/modules/inventory/components/InventorySearchBar";
import { inventoryApi } from "@/modules/inventory/inventory.api";
import { mapInventoryRouteToScope, type InventoryRouteScope } from "@/modules/inventory/navigation.scope";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import type { InventoryProduct } from "@/modules/inventory/inventory.types";
import { InventoryRow } from "@/modules/inventory/InventoryRow";
import { categoriesApi } from "@/modules/categories/categories.api";
import { categoryKeys } from "@/modules/categories/categories.queries";
import type { Category } from "@/modules/categories/categories.types";

import { unitsApi } from "@/modules/units/units.api";
import { unitsKeys } from "@/modules/units/units.queries";
import type { Unit } from "@/modules/units/units.types";

import { useNavLock } from "@/shared/hooks/useNavLock";
import { useInsertedRowAttention } from "@/shared/hooks/useInsertedRowAttention";
import { useOperationalQueryAutoRefresh } from "@/shared/hooks/useOperationalQueryAutoRefresh";

type InventorySellableTabValue = "ITEMS" | "SERVICES";
type InventoryServiceStatusTabValue = "ALL" | "ACTIVE" | "ARCHIVED";
type InventoryHealthTabValue = "ALL" | "LOW_STOCK" | "OUT_OF_STOCK" | "IN_STOCK";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const INVENTORY_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function formatCompactCount(value: number): string {
	const n = Number.isFinite(value) ? value : 0;
	const abs = Math.abs(n);
	if (abs < 1000) {
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
	}
	return new Intl.NumberFormat(undefined, {
		notation: "compact",
		compactDisplay: "short",
		maximumFractionDigits: abs >= 10000 ? 0 : 1,
	}).format(n);
}

function clampPrecisionScale(value: unknown): number {
	const raw = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(raw)) return 0;
	return Math.max(0, Math.min(5, Math.trunc(raw)));
}

function getPrecisionScale(product: InventoryProduct, unitsById?: Map<string, Unit>): number {
	const unitRelation = (product as { Unit?: { precisionScale?: number | null } }).Unit;
	const rawScale = product.unit?.precisionScale ?? unitRelation?.precisionScale ?? product.unitPrecisionScale ?? 0;
	const clamped = clampPrecisionScale(rawScale);
	if (clamped > 0) return clamped;

	// UDQI fallback: listProducts may not include unit precision; derive from cached Units list.
	const unitId = (product as any)?.unitId as string | undefined;
	if (unitId && unitsById && unitsById.has(unitId)) {
		const fromUnit = unitsById.get(unitId)?.precisionScale;
		return clampPrecisionScale(fromUnit ?? 0);
	}

	return 0;
}

function normalizeDecimalString(raw: string, scale: number): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const s = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
	if (!DECIMAL_PATTERN.test(s)) return null;

	const neg = s.startsWith("-");
	const body = neg ? s.slice(1) : s;
	const [intPartRaw, fracRaw = ""] = body.split(".");
	const intPart = intPartRaw || "0";
	if (scale <= 0) return (neg ? "-" : "") + intPart;

	const frac = (fracRaw + "0".repeat(scale)).slice(0, scale);
	return (neg ? "-" : "") + intPart + "." + frac;
}

function applyInventoryTrackingClamp(display: string, scale: number, trackInventory: boolean): string {
	if (!trackInventory) return display;

	const trimmed = display.trim();
	if (!trimmed) return display;

	const neg = trimmed.startsWith("-");
	const body = neg ? trimmed.slice(1) : trimmed;
	const [intPartRaw] = body.split(".");
	const intPart = intPartRaw && intPartRaw.length > 0 ? intPartRaw : "0";

	if (scale <= 0) return (neg ? "-" : "") + intPart;
	return (neg ? "-" : "") + intPart + "." + "0".repeat(scale);
}

function formatOnHandDisplay(
	product: InventoryProduct,
	unitsById?: Map<string, Unit>,
): { precisionScale: number; display: string } {
	const precisionScale = getPrecisionScale(product, unitsById);
	const zero = precisionScale > 0 ? `0.${"0".repeat(precisionScale)}` : "0";

	if (typeof product.onHandCachedRaw === "string") {
		const normalized = normalizeDecimalString(product.onHandCachedRaw, precisionScale);
		if (normalized) {
			return {
				precisionScale,
				display: applyInventoryTrackingClamp(normalized, precisionScale, !!product.trackInventory),
			};
		}
	}

	if (typeof product.onHandCached === "number" && Number.isFinite(product.onHandCached)) {
		const base = product.onHandCached.toFixed(precisionScale);
		return {
			precisionScale,
			display: applyInventoryTrackingClamp(base, precisionScale, !!product.trackInventory),
		};
	}

	if (typeof product.onHandCached === "string") {
		const normalized = normalizeDecimalString(product.onHandCached, precisionScale);
		if (normalized) {
			return {
				precisionScale,
				display: applyInventoryTrackingClamp(normalized, precisionScale, !!product.trackInventory),
			};
		}
		const n = Number(product.onHandCached);
		if (Number.isFinite(n)) {
			const base = n.toFixed(precisionScale);
			return {
				precisionScale,
				display: applyInventoryTrackingClamp(base, precisionScale, !!product.trackInventory),
			};
		}
	}

	return {
		precisionScale,
		display: applyInventoryTrackingClamp(zero, precisionScale, !!product.trackInventory),
	};
}

// ------------------------------
// Sellable Type + Status filtering
// ------------------------------

function isService(p: InventoryProduct): boolean {
	const raw =
		typeof (p as any)?.type === "string"
			? String((p as any).type)
					.trim()
					.toUpperCase()
			: "";
	return raw === "SERVICE";
}

function filterBySellableTab(items: InventoryProduct[], tab: InventorySellableTabValue): InventoryProduct[] {
	if (tab === "SERVICES") return items.filter((p) => isService(p));
	// ITEMS: treat everything non-service as “Items” (PHYSICAL/ITEM/etc.)
	return items.filter((p) => !isService(p));
}

function normalizeSellableTab(raw: unknown): InventorySellableTabValue {
	const s = String(raw ?? "")
		.trim()
		.toUpperCase();
	if (s === "SERVICES") return "SERVICES";
	return "ITEMS";
}

function normalizeHealthTab(raw: unknown): InventoryHealthTabValue {
	const s = String(raw ?? "").trim();
	if (s === "LOW_STOCK" || s === "OUT_OF_STOCK" || s === "IN_STOCK") return s;
	return "ALL";
}

function normalizeServiceStatusTab(raw: unknown): InventoryServiceStatusTabValue {
	const s = String(raw ?? "")
		.trim()
		.toUpperCase();
	if (s === "ALL" || s === "ARCHIVED") return s;
	return "ACTIVE";
}

function filterByStatusTab(items: InventoryProduct[], status: InventoryServiceStatusTabValue): InventoryProduct[] {
	if (status === "ARCHIVED") return items.filter((item) => item.isActive === false);
	if (status === "ACTIVE") return items.filter((item) => item.isActive !== false);
	return items;
}

// ------------------------------
// Inventory Health tab filtering
// ------------------------------

function safeToNumber(v: unknown): number | null {
	if (typeof v === "number") return Number.isFinite(v) ? v : null;
	if (typeof v !== "string") return null;
	const s = v.trim();
	if (!s) return null;
	if (!DECIMAL_PATTERN.test(s)) return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

function getOnHandNumber(product: InventoryProduct): number {
	const fromRaw = safeToNumber((product as any).onHandCachedRaw);
	if (fromRaw !== null) return fromRaw;

	const cached = (product as any).onHandCached;
	const fromCached = safeToNumber(cached);
	if (fromCached !== null) return fromCached;

	return 0;
}

function getReorderPointNumber(product: InventoryProduct): number | null {
	const rp = (product as any).reorderPoint;
	if (rp === null || rp === undefined) return null;

	const n = safeToNumber(rp);
	if (n === null) return null;

	// Reorder point <= 0 means “not configured”
	if (n <= 0) return null;

	return n;
}

function filterByHealthTab(items: InventoryProduct[], tab: InventoryHealthTabValue): InventoryProduct[] {
	if (tab === "ALL") return items;

	return items.filter((p) => {
		const track = !!p.trackInventory;
		if (!track) return false;

		const onHand = getOnHandNumber(p);

		if (tab === "OUT_OF_STOCK") {
			return onHand <= 0;
		}

		if (tab === "IN_STOCK") {
			const rp = getReorderPointNumber(p);
			if (onHand <= 0) return false;
			if (rp === null) return true;
			return onHand > rp;
		}

		// LOW_STOCK (not out-of-stock)
		const rp = getReorderPointNumber(p);
		if (rp === null) return false;

		return onHand > 0 && onHand <= rp;
	});
}

function getInventoryHealthCounts(items: InventoryProduct[]): { low: number; out: number; inStock: number } {
	let low = 0;
	let out = 0;
	let inStock = 0;

	for (const item of items) {
		if (!item.trackInventory) continue;

		const onHand = getOnHandNumber(item);
		if (onHand <= 0) {
			out += 1;
			continue;
		}

		const rp = getReorderPointNumber(item);
		if (rp === null) {
			inStock += 1;
		} else if (onHand > rp) {
			inStock += 1;
		}
		if (rp !== null && onHand <= rp) {
			low += 1;
		}
	}

	return { low, out, inStock };
}

function inventoryHealthEmptyTitle(v: InventoryHealthTabValue): string {
	if (v === "LOW_STOCK") return "No Low Stock Items";
	if (v === "IN_STOCK") return "No In Stock Items";
	if (v === "OUT_OF_STOCK") return "No Out Of Stock Items";
	return "No Items Yet";
}

export default function InventoryPhoneScreen({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const theme = useTheme();
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const surfaceAlt = theme.colors.surfaceVariant ?? theme.colors.surface;
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);

	const params = useLocalSearchParams<{ q?: string; filter?: string; status?: string; type?: string }>();
	const paramQ = useMemo(() => String(params.q ?? "").trim(), [params.q]);

	const [q, setQ] = useState(paramQ);
	useEffect(() => setQ(paramQ), [paramQ]);

	const refreshInFlightRef = useRef(false);

	const { canNavigate, safePush } = useNavLock({ lockMs: 650 });

	const trimmedQ = useMemo(() => q.trim(), [q]);
	const [debouncedQ, setDebouncedQ] = useState(trimmedQ);
	const operationalRefreshInterval = useOperationalQueryAutoRefresh();

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQ(trimmedQ);
		}, SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [trimmedQ]);

	// URL-state normalization
	const sellableTabValue: InventorySellableTabValue = useMemo(() => normalizeSellableTab(params.type), [params.type]);
	const healthTabValue: InventoryHealthTabValue = useMemo(() => normalizeHealthTab(params.filter), [params.filter]);
	const serviceStatusTabValue: InventoryServiceStatusTabValue = useMemo(
		() => normalizeServiceStatusTab(params.status),
		[params.status],
	);
	const productsQuery = useInfiniteQuery({
		queryKey: inventoryKeys.productsInfinite(debouncedQ, { includeArchived: true }),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			inventoryApi.listProducts({
				q: debouncedQ || undefined,
				includeArchived: true,
				limit: INVENTORY_PAGE_SIZE,
				cursor: pageParam ?? undefined,
			}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: 30_000,
		refetchInterval: operationalRefreshInterval,
		refetchIntervalInBackground: false,
	});

	const categoriesQuery = useQuery<{ items: Category[] }>({
		queryKey: categoryKeys.list({ limit: 250 }),
		queryFn: () => categoriesApi.list({ limit: 250 }),
		staleTime: 30_000,
	});

	const unitsQuery = useQuery<Unit[]>({
		queryKey: unitsKeys.list({ includeArchived: false }),
		queryFn: () => unitsApi.listUnits({ includeArchived: false }),
		staleTime: 30_000,
	});

	const unitsById = useMemo(() => {
		const map = new Map<string, Unit>();
		(unitsQuery.data ?? []).forEach((u) => map.set(u.id, u));
		return map;
	}, [unitsQuery.data]);

	const categoryMetaById = useMemo(() => {
		const map = new Map<string, { isActive: boolean; color?: string | null }>();
		(categoriesQuery.data?.items ?? []).forEach((category) => {
			map.set(category.id, { isActive: category.isActive, color: category.color ?? null });
		});
		return map;
	}, [categoriesQuery.data?.items]);

	const allItems = useMemo<InventoryProduct[]>(
		() => productsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
		[productsQuery.data?.pages],
	);

	// Sellable partition (for counts)
	const activeItems = useMemo(() => filterByStatusTab(allItems, "ACTIVE"), [allItems]);
	const allItemItems = useMemo(() => filterBySellableTab(activeItems, "ITEMS"), [activeItems]);
	const allServiceItems = useMemo(() => filterBySellableTab(activeItems, "SERVICES"), [activeItems]);
	const serviceItems = useMemo(() => filterBySellableTab(allItems, "SERVICES"), [allItems]);
	const serviceActiveItems = useMemo(() => filterByStatusTab(serviceItems, "ACTIVE"), [serviceItems]);
	const serviceArchivedItems = useMemo(() => filterByStatusTab(serviceItems, "ARCHIVED"), [serviceItems]);

	// Apply sellable selection
	const sellableItems = useMemo(() => {
		if (sellableTabValue === "SERVICES") {
			return filterByStatusTab(serviceItems, serviceStatusTabValue);
		}
		return filterBySellableTab(activeItems, sellableTabValue);
	}, [activeItems, sellableTabValue, serviceItems, serviceStatusTabValue]);

	// Health tabs and counts apply to Items only.
	const showHealthTabs = sellableTabValue === "ITEMS";
	const showServiceStatusTabs = sellableTabValue === "SERVICES";
	const itemsForHealth = useMemo(() => (showHealthTabs ? sellableItems : []), [showHealthTabs, sellableItems]);
	const healthCounts = useMemo(() => getInventoryHealthCounts(itemsForHealth), [itemsForHealth]);
	const healthAllCount = itemsForHealth.length;
	const serviceStatusTabs: readonly BAIGroupTab<InventoryServiceStatusTabValue>[] = useMemo(
		() => [
			{ label: "Active", value: "ACTIVE", count: serviceActiveItems.length },
			{ label: "All", value: "ALL", count: serviceItems.length },
			{ label: "Archive", value: "ARCHIVED", count: serviceArchivedItems.length },
		],
		[serviceActiveItems.length, serviceArchivedItems.length, serviceItems.length],
	);

	// Apply health filter only when valid
	const filteredItems = useMemo(() => {
		if (!showHealthTabs) return sellableItems;
		return filterByHealthTab(sellableItems, healthTabValue);
	}, [healthTabValue, showHealthTabs, sellableItems]);
	const rowAttentionTokens = useInsertedRowAttention(
		useMemo(() => filteredItems.map((item) => item.id), [filteredItems]),
		{
			scopeKey: `${routeScope}:${sellableTabValue}:${serviceStatusTabValue}:${healthTabValue}:${debouncedQ}`,
		},
	);

	const isSearching = trimmedQ.length > 0;
	const hasActiveFilter = showHealthTabs && healthTabValue !== "ALL";
	const hasActiveServiceStatusFilter = showServiceStatusTabs && serviceStatusTabValue !== "ACTIVE";

	const onRefresh = useCallback(() => {
		if (refreshInFlightRef.current || productsQuery.isFetching) return;
		refreshInFlightRef.current = true;
		productsQuery.refetch().finally(() => {
			refreshInFlightRef.current = false;
		});
	}, [productsQuery]);

	const onEndReached = useCallback(() => {
		if (!productsQuery.hasNextPage) return;
		if (productsQuery.isFetchingNextPage) return;
		void productsQuery.fetchNextPage();
	}, [productsQuery]);

	const setSellableTab = useCallback(
		(v: InventorySellableTabValue) => {
			if (!canNavigate) return;

			// Services: clear health filter (stock doesn’t apply)
			if (v === "SERVICES") {
				router.setParams({ type: "SERVICES", filter: undefined, status: undefined });
				return;
			}

			// Items: keep filter param if present (or leave undefined)
			if (v === "ITEMS") {
				router.setParams({ type: undefined, status: undefined });
				return;
			}
		},
		[canNavigate, router],
	);

	const setHealthTab = useCallback(
		(v: InventoryHealthTabValue) => {
			if (!canNavigate) return;
			if (v === "ALL") router.setParams({ filter: undefined });
			else router.setParams({ filter: v });
		},
		[canNavigate, router],
	);

	const setServiceStatusTab = useCallback(
		(v: InventoryServiceStatusTabValue) => {
			if (!canNavigate) return;
			if (v === "ACTIVE") {
				router.setParams({ status: undefined });
				return;
			}
			router.setParams({ status: v });
		},
		[canNavigate, router],
	);

	// Build tabs with inline counts
	const sellableTabs: readonly BAIGroupTab<InventorySellableTabValue>[] = useMemo(
		() => [
			{ label: "Items", value: "ITEMS", count: allItemItems.length },
			{ label: "Services", value: "SERVICES", count: allServiceItems.length },
		],
		[allItemItems.length, allServiceItems.length],
	);

	const healthTabs: readonly BAIGroupTab<InventoryHealthTabValue>[] = useMemo(
		() => [
			{ label: "All", value: "ALL", count: healthAllCount },
			{ label: "In", value: "IN_STOCK", count: healthCounts.inStock },
			{ label: "Low", value: "LOW_STOCK", count: healthCounts.low },
			{ label: "Out", value: "OUT_OF_STOCK", count: healthCounts.out },
		],
		[healthAllCount, healthCounts.inStock, healthCounts.low, healthCounts.out],
	);

	const isInitialLoading = productsQuery.isLoading && allItems.length === 0;
	const isInitialError = !!productsQuery.isError && allItems.length === 0;

	const emptyTitle = hasActiveFilter
		? inventoryHealthEmptyTitle(healthTabValue)
		: isSearching
			? sellableTabValue === "SERVICES"
				? serviceStatusTabValue === "ARCHIVED"
					? "No Matching Archived Services"
					: serviceStatusTabValue === "ALL"
						? "No Matching Services"
						: "No Matching Active Services"
				: "No Matching Items"
			: sellableTabValue === "SERVICES"
				? serviceStatusTabValue === "ARCHIVED"
					? "No Archived Services"
					: serviceStatusTabValue === "ALL"
						? "No Services Yet"
						: "No Active Services"
				: "No Items Yet";

	const emptyBody = hasActiveFilter
		? "Select “All” To View All Active Inventory."
		: isSearching
			? "Adjust Your Search Or Scan A Different Barcode."
			: sellableTabValue === "SERVICES"
				? serviceStatusTabValue === "ARCHIVED"
					? "Archived services will appear here."
					: serviceStatusTabValue === "ALL"
						? "Create Your First Service To Start Selling Time-Based Work."
						: serviceItems.length === 0
							? "Create Your First Service To Start Selling Time-Based Work."
							: "Switch to All or Archived to review other services."
				: "Add Your First Item To Begin Tracking Inventory.";

	const showPrimaryEmptyCta =
		!isSearching &&
		!hasActiveFilter &&
		!hasActiveServiceStatusFilter &&
		filteredItems.length === 0 &&
		!productsQuery.isError;

	const renderInventoryRow = useCallback(
		({ item }: { item: InventoryProduct }) => {
			const categoryId = item.category?.id ?? (item as any).categoryId ?? "";
			const categoryMeta = categoryId && categoryMetaById.has(categoryId) ? categoryMetaById.get(categoryId) : null;
			const categoryIsActive = categoryMeta?.isActive ?? item.category?.isActive ?? undefined;
			const categoryColor = categoryMeta?.color ?? item.category?.color ?? null;

			const { precisionScale, display } = formatOnHandDisplay(item, unitsById);

			const rowItem: InventoryProduct = {
				...item,
				unitPrecisionScale: precisionScale,
				onHandCachedRaw: display,
			};

			return (
				<InventoryRow
					item={rowItem}
					categoryIsActive={categoryIsActive}
					categoryColor={categoryColor}
					attentionPulseKey={rowAttentionTokens[item.id]}
					showOnHandUnit={false}
					onPress={() => {
						const isSvc = isService(item);
						const base = isSvc ? "/(app)/(tabs)/inventory/services/" : "/(app)/(tabs)/inventory/products/";
						safePush(router, toScopedRoute(`${base}${encodeURIComponent(item.id)}`));
					}}
					disabled={!canNavigate}
				/>
			);
		},
		[canNavigate, categoryMetaById, rowAttentionTokens, router, safePush, toScopedRoute, unitsById],
	);

	const syncLabel = productsQuery.isFetching ? "Syncing…" : "Synced";
	const createRoute = useMemo(() => {
		if (routeScope === "settings-items-services") {
			return sellableTabValue === "SERVICES"
				? toScopedRoute("/(app)/(tabs)/inventory/services/create")
				: toScopedRoute("/(app)/(tabs)/inventory/products/create");
		}
		return toScopedRoute("/(app)/(tabs)/inventory/add-item");
	}, [routeScope, sellableTabValue, toScopedRoute]);
	const onPressCreate = useCallback(() => {
		safePush(router, createRoute);
	}, [createRoute, router, safePush]);

	return (
		<BAIScreen
			tabbed
			padded={false}
			safeTop={routeScope !== "settings-items-services"}
			safeBottom={false}
			safeAreaGradientBottom
			style={styles.root}
		>
			<View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
				<BAIGovernedScrollableLayout
					top={
						<View style={styles.fixedTopZone}>
							<View style={styles.heroRow}>
								<View style={styles.heroLeft}>
									<View style={styles.titleRow}>
										<BAIText variant='title' muted>
											Inventory
										</BAIText>
										<View style={[styles.syncBadge, { borderColor, backgroundColor: surfaceAlt }]}>
											<BAIText variant='caption' style={styles.syncBadgeText}>
												{syncLabel}
											</BAIText>
										</View>
									</View>
									<BAIText variant='body' muted>
										Items And Services
									</BAIText>
								</View>

								<View style={styles.heroRight}>
									<BAIButton
										size='md'
										widthPreset='standard'
										shape='pill'
										onPress={onPressCreate}
										disabled={!canNavigate}
									>
										Create
									</BAIButton>
								</View>
							</View>

							<View style={styles.filterPanel}>
								<View style={styles.searchSectionNoHorizontalPadding}>
									<InventorySearchBar
										value={q}
										onChangeText={setQ}
										onSubmit={() => setQ((v) => v.trim())}
										onPressScan={() => safePush(router, toScopedRoute("/(app)/(tabs)/inventory/scan"))}
										scanEnabled={canNavigate}
										disabled={false}
									/>
								</View>

								<View style={styles.tabsSectionNoHorizontalPadding}>
									{/* 1) Sellable Type */}
									<View style={styles.tabsRowTight}>
										<BAIGroupTabs<InventorySellableTabValue>
											tabs={sellableTabs}
											value={sellableTabValue}
											onChange={setSellableTab}
											disabled={!canNavigate}
											countFormatter={formatCompactCount}
										/>
									</View>

									{/* 2) Stock Health — Items only */}
									{showHealthTabs ? (
										<View style={styles.tabsRowTight}>
											<BAIGroupTabs<InventoryHealthTabValue>
												tabs={healthTabs}
												value={healthTabValue}
												onChange={setHealthTab}
												disabled={!canNavigate}
												countFormatter={formatCompactCount}
											/>
										</View>
									) : null}

									{showServiceStatusTabs ? (
										<View style={styles.tabsRowTight}>
											<BAIGroupTabs<InventoryServiceStatusTabValue>
												tabs={serviceStatusTabs}
												value={serviceStatusTabValue}
												onChange={setServiceStatusTab}
												disabled={!canNavigate}
												countFormatter={formatCompactCount}
											/>
										</View>
									) : null}
								</View>
							</View>
						</View>
					}
					scrollArea={
						<View style={styles.scrollArea}>
							{isInitialLoading ? (
								<View style={styles.centerState}>
									<BAIText variant='body' muted style={styles.centerStateText}>
										Loading inventory...
									</BAIText>
								</View>
							) : isInitialError ? (
								<View style={styles.centerState}>
									<BAIText variant='subtitle'>Could not load inventory.</BAIText>
									<BAIText variant='body' muted style={styles.centerStateText}>
										Check your connection and retry.
									</BAIText>
									<View style={styles.retryWrap}>
										<BAIRetryButton mode='contained' variant='outline' onPress={onRefresh}>
											Retry
										</BAIRetryButton>
									</View>
								</View>
							) : (
								<FlatList
									data={filteredItems}
									keyExtractor={(p) => p.id}
									style={styles.list}
									contentContainerStyle={[
										styles.listContent,
										filteredItems.length === 0 ? styles.listContentEmpty : null,
									]}
									showsVerticalScrollIndicator={false}
									showsHorizontalScrollIndicator={false}
									renderItem={renderInventoryRow}
									ItemSeparatorComponent={() => <View style={styles.itemGap} />}
									ListEmptyComponent={
										<View style={styles.emptyState}>
											<BAIText variant='subtitle' style={styles.emptyStateTitle}>
												{emptyTitle}
											</BAIText>
											<BAIText variant='body' muted style={styles.emptyStateBody}>
												{emptyBody}
											</BAIText>
											{showPrimaryEmptyCta ? (
												<View style={styles.emptyCtaWrap}>
													<BAIEmptyStateButton
														mode='contained'
														shape='pill'
														label={sellableTabValue === "SERVICES" ? "Create Service" : "Add Item"}
														onPress={onPressCreate}
													/>
												</View>
											) : null}
										</View>
									}
									keyboardShouldPersistTaps='handled'
									keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
									onEndReached={onEndReached}
									onEndReachedThreshold={0.4}
									ListFooterComponent={<View style={styles.loadMoreFooter} />}
								/>
							)}
						</View>
					}
				/>
			</View>
		</BAIScreen>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },

	screen: {
		flex: 1,
		minHeight: 0,
		paddingHorizontal: 12,
		paddingBottom: 0,
		paddingTop: 0, // Ensure no top padding
		gap: 0,
	},
	fixedTopZone: {
		gap: 4,
		paddingTop: 6,
		paddingBottom: 6,
	},

	heroRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: 2,
		gap: 8,
	},
	heroLeft: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	heroRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginLeft: 12,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		flexWrap: "wrap",
	},
	syncBadge: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	syncBadgeText: {
		fontWeight: "600",
	},

	scrollArea: {
		flex: 1,
		minHeight: 0,
		marginTop: 0,
		marginBottom: 0,
	},
	filterPanel: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		gap: 6,
	},
	searchSectionNoHorizontalPadding: {
		marginHorizontal: -12,
	},
	tabsSectionNoHorizontalPadding: {
		marginHorizontal: -12,
		gap: 8,
	},
	tabsRowTight: {
		marginTop: 0,
	},

	list: { flex: 1, minHeight: 0 },
	listContent: { paddingTop: 0, paddingBottom: 200 },
	listContentEmpty: { flexGrow: 1 },
	itemGap: { height: 10 },
	centerState: {
		flex: 1,
		minHeight: 0,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 20,
	},
	centerStateText: {
		marginTop: 10,
		textAlign: "center",
	},
	retryWrap: {
		marginTop: 14,
	},
	emptyState: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 20,
		paddingTop: 16,
		paddingBottom: 24,
	},
	emptyStateTitle: {
		textAlign: "center",
	},
	emptyStateBody: {
		textAlign: "center",
		marginTop: 8,
	},
	emptyCtaWrap: {
		marginTop: 14,
	},
	loadMoreFooter: {
		paddingVertical: 12,
		alignItems: "center",
		justifyContent: "center",
	},
});
