// BizAssist_mobile
// path: app/(app)/(tabs)/settings/units/units.ledger.tsx
//
// Header governance:
// - This is a Settings detail/workspace screen → use BACK (not Exit).
// - Back is deterministic to Settings root.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useTheme } from "react-native-paper";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { BAIButton } from "@/components/ui/BAIButton";
import { BAICTAPillButton } from "@/components/ui/BAICTAButton";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAISearchBar } from "@/components/ui/BAISearchBar";
import { BAIPressableRow } from "@/components/ui/BAIPressableRow";
import { BAIGroupTabs, type BAIGroupTab } from "@/components/ui/BAIGroupTabs";
import { useAppBusy } from "@/hooks/useAppBusy";
import { formatCompactNumber } from "@/lib/locale/businessLocale";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { unitsApi } from "@/modules/units/units.api";
import { syncUnitListCaches } from "@/modules/units/units.cache";
import { unitKeys, useUnitVisibilityQuery } from "@/modules/units/units.queries";
import { precisionHint } from "@/modules/units/units.format";
import type { Unit } from "@/modules/units/units.types";
import { displayUnitAbbreviation, displayUnitLabel, isEachUnitLike } from "@/modules/units/units.display";
import { clearUnitSelectionParams, SETTINGS_UNITS_ROUTE, UNITS_INDEX_ROUTE } from "@/modules/units/units.navigation";
import { parseUnitSelectionParams, RETURN_TO_KEY, UNIT_ADD_ROUTE } from "@/modules/units/unitPicker.contract";
import { useAppHeader } from "@/modules/navigation/useAppHeader";
import { useInventoryHeader } from "@/modules/inventory/useInventoryHeader";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import { sanitizeSearchInput } from "@/shared/validation/sanitize";

type UnitsLedgerLayout = "phone" | "tablet";
type UnitsLedgerMode = "settings" | "inventory";
type UnitFilter = "all" | "active" | "archived";
const SETTINGS_ROUTE = "/(app)/(tabs)/settings" as const;
const INVENTORY_ROUTE = "/(app)/(tabs)/inventory" as const;
const UNIT_VISIBILITY_ROUTE = "/(app)/(tabs)/settings/units/visibility" as const;
const SETTINGS_UNIT_ADD_ROUTE = "/(app)/(tabs)/settings/units/add" as const;
const UNITS_QUERY_KEY = unitKeys.list({ includeArchived: true });
const EACH_PRECISION_SCALE = 0;
const DEFAULT_PRECISION_SCALE = 2;
const UNIT_RIGHT_ICON_SIZE = 24;
const UNIT_TAB_BASE: readonly BAIGroupTab<UnitFilter>[] = [
	{ label: "Active", value: "active" },
	{ label: "Archived", value: "archived" },
	{ label: "All", value: "all" },
] as const;

function isCustomUnit(unit: Unit): boolean {
	return !unit.catalogId;
}

function clampPrecisionScale(value: unknown): number {
	const raw = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(raw)) return 0;
	return Math.max(0, Math.min(5, Math.trunc(raw)));
}

function effectivePrecisionForDisplay(unit: Unit): number {
	if (unit.category === "COUNT") return clampPrecisionScale(unit.precisionScale ?? EACH_PRECISION_SCALE);
	return clampPrecisionScale(unit.precisionScale ?? DEFAULT_PRECISION_SCALE);
}

function categoryLabel(category: Unit["category"]): string {
	if (category === "COUNT") return "Count";
	if (category === "WEIGHT") return "Weight";
	if (category === "VOLUME") return "Volume";
	if (category === "LENGTH") return "Length";
	if (category === "AREA") return "Area";
	if (category === "TIME") return "Time";
	if (category === "CUSTOM") return "Custom";
	return category;
}

function precisionLabel(scale: number): string {
	const safe = clampPrecisionScale(scale || 0);
	if (safe === 0) return "Whole units (1)";
	return `${safe} decimal${safe === 1 ? "" : "s"} (${precisionHint(safe)})`;
}

function unitSubtitle(unit: Unit): string {
	const metaParts = [isCustomUnit(unit) ? "Custom" : "System", categoryLabel(unit.category)];
	const abbr = displayUnitAbbreviation(unit);
	if (abbr) metaParts.push(abbr);
	metaParts.push(precisionLabel(effectivePrecisionForDisplay(unit)));
	return metaParts.join(" • ");
}

function UnitRow({
	name,
	meta,
	onPress,
	disabled,
	isArchived,
	isHidden,
}: {
	name: string;
	meta: string;
	onPress: () => void;
	disabled?: boolean;
	isArchived: boolean;
	isHidden: boolean;
}) {
	const theme = useTheme();
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const backgroundColor =
		(theme.colors as any).surfaceVariant ?? (theme.dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.035)");
	const pressedBg = theme.dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";
	const chevronColor = theme.colors.onSurfaceVariant ?? theme.colors.onSurface;
	const rightIcon = isArchived ? "archive-outline" : isHidden ? "eye-off" : "chevron-right";
	const rightIconColor = isArchived ? theme.colors.error : chevronColor;

	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			style={({ pressed }) => [
				styles.unitRow,
				{ borderColor, backgroundColor },
				disabled && { opacity: 0.45 },
				pressed && !disabled && { backgroundColor: pressedBg },
			]}
		>
			<View style={styles.unitRowLeft}>
				<BAIText variant='subtitle' numberOfLines={1} style={styles.unitNameText}>
					{name}
				</BAIText>
				<BAIText variant='caption' muted numberOfLines={1}>
					{meta}
				</BAIText>
			</View>
			<MaterialCommunityIcons name={rightIcon} size={UNIT_RIGHT_ICON_SIZE} color={rightIconColor} />
		</Pressable>
	);
}
export function UnitsLedgerScreen({
	layout,
	mode = "settings",
}: {
	layout: UnitsLedgerLayout;
	mode?: UnitsLedgerMode;
}) {
	const router = useRouter();
	const params = useLocalSearchParams();
	const theme = useTheme();
	const tabBarHeight = useBottomTabBarHeight();
	const { busy } = useAppBusy();
	const queryClient = useQueryClient();
	const { countryCode } = useActiveBusinessMeta();
	const inbound = useMemo(() => parseUnitSelectionParams(params as any), [params]);

	const isTablet = layout === "tablet";
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<UnitFilter>("active");
	const [pinnedUnitId, setPinnedUnitId] = useState<string | null>(null);
	const pinnedSetAtRef = useRef<number | null>(null);

	const [isPullRefreshing, setIsPullRefreshing] = useState(false);
	const lastFocusRefetchAtRef = useRef(0);

	const navLockRef = useRef(false);
	const [isNavLocked, setIsNavLocked] = useState(false);
	const lockNav = useCallback((ms = 650) => {
		if (navLockRef.current) return false;
		navLockRef.current = true;
		setIsNavLocked(true);
		setTimeout(() => {
			navLockRef.current = false;
			setIsNavLocked(false);
		}, ms);
		return true;
	}, []);

	const isUiDisabled = busy.isBusy || isNavLocked;
	const onBack = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		router.replace(mode === "settings" ? (SETTINGS_ROUTE as any) : (INVENTORY_ROUTE as any));
	}, [isUiDisabled, lockNav, mode, router]);
	const settingsHeaderOptions = useAppHeader("detail", {
		title: "Unit Management",
		disabled: isUiDisabled,
		onBack,
		showAvatarPlaceholder: true,
	});
	const inventoryHeaderOptions = useInventoryHeader("detail", {
		title: "Unit Management",
		disabled: isUiDisabled,
		onBack,
		showAvatarPlaceholder: true,
	});
	const headerOptions = mode === "settings" ? settingsHeaderOptions : inventoryHeaderOptions;

	const unitsQuery = useQuery<Unit[]>({
		queryKey: UNITS_QUERY_KEY,
		queryFn: () => unitsApi.listUnits({ includeArchived: true }),
		staleTime: 300_000,
		refetchOnMount: true,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});

	useEffect(() => {
		if (inbound.selectionSource !== "created") return;
		if (!inbound.selectedUnitId) return;
		setPinnedUnitId(inbound.selectedUnitId);
		pinnedSetAtRef.current = unitsQuery.dataUpdatedAt || Date.now();
		clearUnitSelectionParams(router as any);
	}, [inbound.selectedUnitId, inbound.selectionSource, router, unitsQuery.dataUpdatedAt]);

	useEffect(() => {
		if (!pinnedUnitId) return;
		const pinnedAt = pinnedSetAtRef.current ?? 0;
		if (!unitsQuery.dataUpdatedAt || unitsQuery.dataUpdatedAt <= pinnedAt) return;
		setPinnedUnitId(null);
		pinnedSetAtRef.current = null;
	}, [pinnedUnitId, unitsQuery.dataUpdatedAt]);

	const visibilityQuery = useUnitVisibilityQuery();
	const hiddenUnitIds = visibilityQuery.hiddenUnitIds;
	const hiddenCount = hiddenUnitIds.size;
	const compactHidden = formatCompactNumber(hiddenCount, countryCode);
	const visibilityValue = hiddenCount > 0 ? `${compactHidden} hidden. Hide or restore units.` : "Hide or restore units";

	const ensureEachRef = useRef(false);
	useEffect(() => {
		if (!unitsQuery.isFetched || ensureEachRef.current) return;
		const list = unitsQuery.data ?? [];
		if (list.some((unit) => isEachUnitLike(unit))) return;
		ensureEachRef.current = true;

		unitsApi
			.enableCatalogUnit({
				intent: "ENABLE_CATALOG",
				catalogId: "ea",
				precisionScale: EACH_PRECISION_SCALE,
			})
			.then((unit) => {
				syncUnitListCaches(queryClient, unit);
			})
			.catch(() => {
				ensureEachRef.current = false;
			});
	}, [queryClient, unitsQuery.data, unitsQuery.isFetched]);

	const onRefresh = useCallback(async () => {
		if (isUiDisabled) return;
		if (unitsQuery.isFetching) return;
		setIsPullRefreshing(true);
		try {
			await unitsQuery.refetch({ cancelRefetch: true });
		} finally {
			setIsPullRefreshing(false);
		}
	}, [isUiDisabled, unitsQuery]);

	useFocusEffect(
		useCallback(() => {
			// Keep the list up-to-date after edits/archives when the screen regains focus.
			// Guardrail: prevent refetch loops and UI flicker.
			const now = Date.now();
			if (busy.isBusy) return;
			if (isPullRefreshing) return;
			if (unitsQuery.isFetching) return;
			if (now - lastFocusRefetchAtRef.current < 1200) return;

			// If the list is stale (or missing), refetch in the background.
			if (!unitsQuery.data || unitsQuery.isStale) {
				lastFocusRefetchAtRef.current = now;
				unitsQuery.refetch({ cancelRefetch: true });
			}

			return;
		}, [busy.isBusy, isPullRefreshing, unitsQuery]),
	);

	const onPressVisibility = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		router.push(UNIT_VISIBILITY_ROUTE as any);
	}, [isUiDisabled, lockNav, router]);

	const onCancel = useCallback(() => {
		onBack();
	}, [onBack]);

	const onAddUnit = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		router.push({
			pathname: (mode === "settings" ? SETTINGS_UNIT_ADD_ROUTE : UNIT_ADD_ROUTE) as any,
			params: {
				[RETURN_TO_KEY]: mode === "settings" ? SETTINGS_UNITS_ROUTE : UNITS_INDEX_ROUTE,
			} as any,
		});
	}, [isUiDisabled, lockNav, mode, router]);

	const listedUnits = useMemo(() => {
		const list = unitsQuery.data ?? [];
		return [...list].sort((a, b) => {
			const aLabel = displayUnitLabel(a).toLowerCase();
			const bLabel = displayUnitLabel(b).toLowerCase();
			return aLabel.localeCompare(bLabel);
		});
	}, [unitsQuery.data]);

	const unitCounts = useMemo(() => {
		let active = 0;
		let archived = 0;
		listedUnits.forEach((unit) => {
			if (unit.isActive) {
				active += 1;
			} else {
				archived += 1;
			}
		});

		return {
			active,
			archived,
			all: listedUnits.length,
		};
	}, [listedUnits]);

	const unitTabs = useMemo(
		() =>
			UNIT_TAB_BASE.map((tab) => ({
				...tab,
				count: unitCounts[tab.value],
			})),
		[unitCounts],
	);

	const filteredByStatus = useMemo(() => {
		const base =
			filter === "active"
				? listedUnits.filter((unit) => unit.isActive)
				: filter === "archived"
					? listedUnits.filter((unit) => !unit.isActive)
					: listedUnits;

		if (!pinnedUnitId) return base;
		const pinnedIndex = base.findIndex((unit) => unit.id === pinnedUnitId);
		if (pinnedIndex <= 0) return base;
		const pinned = base[pinnedIndex];
		return [pinned, ...base.filter((_, index) => index !== pinnedIndex)];
	}, [filter, listedUnits, pinnedUnitId]);

	const filteredUnits = useMemo(() => {
		const needle = searchQuery.trim().toLowerCase();
		if (!needle) return filteredByStatus;
		return filteredByStatus.filter((unit) => {
			const originLabel = unit.catalogId ? "System" : "Custom";
			const haystack = [displayUnitLabel(unit), unit.category, originLabel, unit.abbreviation ?? ""]
				.join(" ")
				.toLowerCase();
			return haystack.includes(needle);
		});
	}, [filteredByStatus, searchQuery]);

	const onOpenUnit = useCallback(
		(unitId: string) => {
			if (isUiDisabled) return;
			if (!lockNav()) return;
			router.push(`/(app)/(tabs)/settings/units/${encodeURIComponent(unitId)}` as any);
		},
		[isUiDisabled, lockNav, router],
	);

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;

	const unitsCard = (
		<BAISurface style={[styles.unitsContainer, { borderColor }]} padded bordered>
			<View style={styles.unitsHeader}>
				<BAIText variant='title'>Units</BAIText>
			</View>

			<View style={styles.actionsRow}>
				<BAIButton
					variant='outline'
					compact
					onPress={onCancel}
					disabled={isUiDisabled}
					shape='pill'
					widthPreset='standard'
					style={styles.actionButton}
					intent='neutral'
				>
					Cancel
				</BAIButton>
				<BAICTAPillButton
					intent='primary'
					variant='solid'
					compact
					onPress={onAddUnit}
					disabled={isUiDisabled}
					style={styles.actionButton}
				>
					Add Unit
				</BAICTAPillButton>
			</View>

			{mode === "settings" ? (
				<BAIPressableRow
					label='Unit Visibility'
					value={visibilityValue}
					onPress={onPressVisibility}
					disabled={isUiDisabled}
					style={styles.visibilityRow}
				/>
			) : null}

			<View style={styles.searchWrap}>
				<BAISearchBar
					placeholder='Search units'
					value={searchQuery}
					onChangeText={(value) => {
						const cleaned = sanitizeSearchInput(value);
						setSearchQuery(cleaned.length > FIELD_LIMITS.search ? cleaned.slice(0, FIELD_LIMITS.search) : cleaned);
					}}
					maxLength={FIELD_LIMITS.search}
					disabled={isUiDisabled}
					returnKeyType='search'
				/>
			</View>

			<BAIGroupTabs
				tabs={unitTabs}
				value={filter}
				onChange={setFilter}
				disabled={isUiDisabled}
				countFormatter={(count) => formatCompactNumber(count, countryCode)}
			/>

			{!unitsQuery.isLoading && !unitsQuery.isError && filteredUnits.length === 0 && !searchQuery.trim() ? (
				<View style={styles.emptyHelper}>
					<BAIText variant='body'>
						{filter === "active"
							? "No active units are currently available."
							: filter === "archived"
								? "No archived units are currently available."
								: "No units are currently available."}
					</BAIText>
					<BAIText variant='caption' muted style={{ marginTop: 4 }}>
						{filter === "archived" ? "Please archive a unit to view it here." : "Please add a unit to continue."}
					</BAIText>
				</View>
			) : null}

			{!unitsQuery.isLoading && !unitsQuery.isError && filteredUnits.length === 0 && !!searchQuery.trim() ? (
				<View style={styles.emptyHelper}>
					<BAIText variant='body'>No units match the current search criteria.</BAIText>
					<BAIText variant='caption' muted style={{ marginTop: 4 }}>
						Please revise the search term and try again.
					</BAIText>
				</View>
			) : null}

			{!unitsQuery.isLoading && !unitsQuery.isError && filteredUnits.length > 0 ? (
				<FlatList
					data={filteredUnits}
					keyExtractor={(item) => item.id}
					renderItem={({ item }) => {
						const name = displayUnitLabel(item);
						const meta = unitSubtitle(item);
						const isArchived = item.isActive === false;
						const isHidden = hiddenUnitIds.has(item.id);
						return (
							<UnitRow
								name={name}
								meta={meta}
								onPress={() => onOpenUnit(item.id)}
								disabled={isUiDisabled}
								isArchived={isArchived}
								isHidden={isHidden}
							/>
						);
					}}
					style={styles.unitsListScroll}
					contentContainerStyle={styles.unitsList}
					showsVerticalScrollIndicator={false}
					keyboardShouldPersistTaps='handled'
					removeClippedSubviews
					initialNumToRender={12}
					windowSize={7}
				/>
			) : null}

			{unitsQuery.isError && (!unitsQuery.data || unitsQuery.data.length === 0) ? (
				<View style={styles.emptyError}>
					<BAIText variant='body'>Units could not be loaded.</BAIText>
					<BAIText variant='caption' muted style={{ marginTop: 4 }}>
						Please check your connection and try again.
					</BAIText>
					<View style={{ marginTop: 10 }}>
						<BAIRetryButton variant='outline' mode='contained' onPress={onRefresh} disabled={isUiDisabled}>
							Retry
						</BAIRetryButton>
					</View>
				</View>
			) : null}
		</BAISurface>
	);

	return (
		<>
			<Stack.Screen options={headerOptions} />
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom={false}>
				{isTablet ? (
					<View style={[styles.centerWrap, { paddingBottom: tabBarHeight + 12 }]}>
						<View style={[styles.column, styles.columnPadded, isTablet && styles.contentTablet]}>{unitsCard}</View>
					</View>
				) : (
					<View style={[styles.screen, { paddingBottom: tabBarHeight + 10 }]}>{unitsCard}</View>
				)}
			</BAIScreen>
		</>
	);
}

export default UnitsLedgerScreen;

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		gap: 8,
		paddingTop: 0,
		padding: 10,
	},
	centerWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "flex-start",
	},
	column: {
		width: "100%",
		gap: 8,
	},
	columnPadded: {
		paddingHorizontal: 10,
	},
	contentTablet: {
		maxWidth: 720,
	},

	unitsContainer: {
		flex: 1,
		gap: 8,
		borderRadius: 18,
	},
	unitsHeader: {
		gap: 2,
	},
	unitRow: {
		borderWidth: 1,
		borderRadius: 12,
		paddingVertical: 10,
		paddingLeft: 12,
		paddingRight: 8,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
	},
	unitRowLeft: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	unitNameText: {
		fontWeight: "500",
	},
	emptyError: {
		marginTop: 4,
		paddingVertical: 4,
	},
	emptyHelper: {
		marginTop: 4,
		paddingVertical: 4,
	},
	searchWrap: {
		marginTop: 0,
	},
	unitsList: {
		marginTop: 0,
		gap: 10,
		paddingBottom: 8,
	},
	unitsListScroll: {
		flex: 1,
		minHeight: 200,
	},
	visibilityRow: {
		marginTop: 2,
	},
	actionsRow: {
		flexDirection: "row",
		alignItems: "stretch",
		justifyContent: "space-between",
		gap: 8,
	},
	actionButton: {
		flex: 1,
	},
});
