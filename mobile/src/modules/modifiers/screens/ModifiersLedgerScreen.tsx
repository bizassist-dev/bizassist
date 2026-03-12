import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Keyboard, Pressable, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIGovernedScrollableLayout } from "@/components/ui/BAIGovernedScrollableLayout";
import { BAIGroupTabs, type BAIGroupTab } from "@/components/ui/BAIGroupTabs";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISearchWithScanButton } from "@/components/ui/BAISearchWithScanButton";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { useResponsiveLayout } from "@/lib/layout/useResponsiveLayout";
import { formatCompactNumber } from "@/lib/locale/businessLocale";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { modifiersApi } from "@/modules/modifiers/modifiers.api";
import type { ModifierGroup } from "@/modules/modifiers/modifiers.types";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import { sanitizeSearchInput } from "@/shared/validation/sanitize";

const modifierGroupsKey = ["modifiers", "groups", "inventory"] as const;
const INVENTORY_MODIFIERS_ROUTE = "/(app)/(tabs)/inventory/modifiers" as const;
const INVENTORY_ROOT_ROUTE = "/(app)/(tabs)/inventory" as const;
const INVENTORY_SCAN_ROUTE = "/(app)/(tabs)/inventory/scan" as const;
const SCANNED_BARCODE_KEY = "scannedBarcode" as const;

type ModifierFilter = "active" | "archived";

function resolveModifierFilter(raw: unknown): ModifierFilter {
	return String(raw ?? "")
		.trim()
		.toLowerCase() === "archived"
		? "archived"
		: "active";
}

function buildOptionSummary(item: ModifierGroup) {
	const options = item.options
		.filter((option) => !option.isArchived)
		.map((option) => ({ label: option.name.trim(), isSoldOut: option.isSoldOut }))
		.filter((option) => option.label.length > 0);

	return {
		entries: options.slice(0, 3),
		remainingCount: Math.max(0, options.length - 3),
	};
}

function Row({
	item,
	onOpen,
	countryCode,
}: {
	item: ModifierGroup;
	onOpen: (item: ModifierGroup) => void;
	countryCode?: string | null;
}) {
	const theme = useTheme();
	const optionSummary = buildOptionSummary(item);
	const availableLabel = `${formatCompactNumber(item.availableOptionsCount, countryCode)} available`;
	const soldOutLabel = `${formatCompactNumber(item.soldOutOptionsCount, countryCode)} sold out`;
	const remainingOptionsLabel =
		optionSummary.remainingCount > 0 ? formatCompactNumber(optionSummary.remainingCount, countryCode) : null;
	const rowNameColor = item.isArchived
		? (theme.colors.onSurfaceVariant ?? theme.colors.onSurface)
		: theme.colors.onSurface;

	return (
		<BAISurface
			style={[
				styles.row,
				{
					borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
					backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
				},
			]}
			padded
		>
			<Pressable onPress={() => onOpen(item)} style={styles.pressArea}>
				<View style={styles.left}>
					<View style={styles.textBlock}>
						<View style={styles.nameRow}>
							<BAIText variant='subtitle' style={[styles.nameText, { color: rowNameColor }]} numberOfLines={1}>
								{item.name}
							</BAIText>
						</View>
						<BAIText variant='caption' muted numberOfLines={1} style={styles.countText}>
							{optionSummary.entries.length === 0 ? (
								"No modifiers"
							) : (
								<>
									{optionSummary.entries.map((option, index) => (
										<BAIText key={`${item.id}-${option.label}-${index}`} variant='caption' muted>
											{index > 0 ? ", " : ""}
											<BAIText
												variant='caption'
												muted={!option.isSoldOut}
												style={option.isSoldOut ? { color: theme.colors.error } : undefined}
											>
												{option.label}
											</BAIText>
										</BAIText>
									))}
									{remainingOptionsLabel ? `, +${remainingOptionsLabel} more` : null}
								</>
							)}
						</BAIText>
					</View>
				</View>
				<View style={styles.rightSide}>
					<View style={styles.rightMeta}>
						{item.isArchived ? (
							<BAIText variant='caption' style={{ color: theme.colors.error }} numberOfLines={1}>
								Archived
							</BAIText>
						) : null}
						<BAIText variant='body' muted numberOfLines={1}>
							{availableLabel}
						</BAIText>
						{item.soldOutOptionsCount > 0 ? (
							<BAIText variant='caption' style={{ color: theme.colors.error }} numberOfLines={1}>
								{soldOutLabel}
							</BAIText>
						) : null}
					</View>
					<MaterialCommunityIcons
						name='chevron-right'
						size={22}
						color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
					/>
				</View>
			</Pressable>
		</BAISurface>
	);
}

export function ModifiersLedgerScreen() {
	const router = useRouter();
	const theme = useTheme();
	const { isTablet } = useResponsiveLayout();
	const params = useLocalSearchParams<{ filter?: string; scannedBarcode?: string }>();
	const { countryCode } = useActiveBusinessMeta();
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<ModifierFilter>(() => resolveModifierFilter(params.filter));

	useEffect(() => {
		setFilter(resolveModifierFilter(params.filter));
	}, [params.filter]);

	useEffect(() => {
		const scanned = typeof params.scannedBarcode === "string" ? params.scannedBarcode.trim() : "";
		if (!scanned) return;
		const cleaned = sanitizeSearchInput(scanned);
		setSearch(cleaned.length > FIELD_LIMITS.search ? cleaned.slice(0, FIELD_LIMITS.search) : cleaned);
		router.setParams({ [SCANNED_BARCODE_KEY]: undefined } as any);
	}, [params.scannedBarcode, router]);

	const groupsQuery = useQuery({
		queryKey: modifierGroupsKey,
		queryFn: () => modifiersApi.listGroups(true),
		staleTime: 30_000,
	});

	const onOpen = useCallback(
		(item: ModifierGroup) => {
			const detailRoute = `${INVENTORY_MODIFIERS_ROUTE}/${encodeURIComponent(item.id)}`;
			const returnTo = `${INVENTORY_MODIFIERS_ROUTE}?filter=${filter}`;
			router.push(`${detailRoute}?returnTo=${encodeURIComponent(returnTo)}` as any);
		},
		[filter, router],
	);

	const searchedItems = useMemo(() => {
		const all = groupsQuery.data ?? [];
		const q = search.trim().toLowerCase();
		if (!q) return all;
		return all.filter((group) => group.name.toLowerCase().includes(q));
	}, [groupsQuery.data, search]);

	const activeItems = useMemo(() => searchedItems.filter((group) => !group.isArchived), [searchedItems]);
	const archivedItems = useMemo(() => searchedItems.filter((group) => group.isArchived), [searchedItems]);
	const items = filter === "archived" ? archivedItems : activeItems;

	const modifierTabs = useMemo<readonly BAIGroupTab<ModifierFilter>[]>(
		() => [
			{ label: "Active", value: "active", count: activeItems.length },
			{ label: "Archived", value: "archived", count: archivedItems.length },
		],
		[activeItems.length, archivedItems.length],
	);

	const dismissKeyboard = useCallback(() => {
		Keyboard.dismiss();
	}, []);

	const onCancel = useCallback(() => {
		router.replace(INVENTORY_ROOT_ROUTE as any);
	}, [router]);

	const onCreate = useCallback(() => {
		router.push(`${INVENTORY_MODIFIERS_ROUTE}/create` as any);
	}, [router]);

	const onOpenScanner = useCallback(() => {
		const returnTo = `${INVENTORY_MODIFIERS_ROUTE}?filter=${filter}`;
		router.push({
			pathname: INVENTORY_SCAN_ROUTE as any,
			params: { returnTo },
		} as any);
	}, [filter, router]);

	const hasSearch = search.trim().length > 0;

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom={false} safeAreaGradientBottom style={styles.root}>
				<BAIHeader
					title='Modifiers'
					variant='back'
					onLeftPress={onCancel}
					onRightPress={onCreate}
					rightSlot={({ disabled }) => (
						<View style={[styles.addCircle, { backgroundColor: theme.colors.primary, opacity: disabled ? 0.5 : 1 }]}>
							<MaterialCommunityIcons name='plus' size={30} color={theme.colors.onPrimary} />
						</View>
					)}
				/>
				<TouchableWithoutFeedback onPress={dismissKeyboard} accessible={false}>
					<View style={styles.wrap}>
						<View style={[styles.content, isTablet ? styles.tablet : null]}>
							<BAISurface style={[styles.card, styles.cardTransparent]} padded={false} bordered={false}>
								<BAIGovernedScrollableLayout
									top={
										<View
											style={[
												styles.controlsContainer,
												{
													borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
												},
											]}
										>
											<View style={styles.controls}>
												<BAISearchWithScanButton
													value={search}
													onChangeText={(value) => {
														const cleaned = sanitizeSearchInput(value);
														setSearch(
															cleaned.length > FIELD_LIMITS.search ? cleaned.slice(0, FIELD_LIMITS.search) : cleaned,
														);
													}}
													onPressScan={onOpenScanner}
													placeholder='Search modifiers...'
													maxLength={FIELD_LIMITS.search}
													onSubmit={() => setSearch((value) => value.trim())}
													scanEnabled
													searchAccessibilityLabel='Search modifiers'
													style={styles.searchControl}
												/>
												<View style={styles.groupTabsWrap}>
													<BAIGroupTabs
														tabs={modifierTabs}
														value={filter}
														onChange={setFilter}
														countFormatter={(count) => formatCompactNumber(count, countryCode)}
													/>
												</View>
											</View>
										</View>
									}
									scrollArea={
										<View style={styles.listSection}>
											{groupsQuery.isLoading ? (
												<View style={styles.stateWrap}>
													<BAIText variant='body'>Loading modifier sets...</BAIText>
												</View>
											) : groupsQuery.isError ? (
												<View style={styles.stateWrap}>
													<BAIRetryButton compact onPress={() => groupsQuery.refetch()}>
														Retry
													</BAIRetryButton>
												</View>
											) : items.length === 0 ? (
												<BAISurface bordered style={styles.emptyWrap}>
													<BAIText variant='body'>
														{hasSearch
															? `No matching ${filter === "active" ? "active" : "archived"} modifier sets.`
															: filter === "active"
																? "No active modifier sets."
																: "No archived modifier sets."}
													</BAIText>
													<BAIText variant='caption' muted>
														{hasSearch
															? "Try a different search term."
															: filter === "active"
																? "Create your first modifier set."
																: "Archived modifier sets will appear here."}
													</BAIText>
													{!hasSearch && filter === "active" ? (
														<BAIButton
															variant='solid'
															intent='primary'
															shape='pill'
															onPress={onCreate}
															style={styles.emptyAction}
														>
															Create Modifier Set
														</BAIButton>
													) : null}
												</BAISurface>
											) : (
												<FlatList
													data={items}
													keyExtractor={(item) => item.id}
													renderItem={({ item }) => <Row item={item} onOpen={onOpen} countryCode={countryCode} />}
													style={styles.list}
													contentContainerStyle={styles.listContent}
													keyboardShouldPersistTaps='handled'
													showsVerticalScrollIndicator={false}
													initialNumToRender={10}
													maxToRenderPerBatch={10}
													windowSize={7}
												/>
											)}
										</View>
									}
								/>
							</BAISurface>
						</View>
					</View>
				</TouchableWithoutFeedback>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	wrap: { flex: 1, minHeight: 0, paddingHorizontal: 12, paddingTop: 0 },
	content: { flex: 1, minHeight: 0, width: "100%", alignSelf: "center" },
	tablet: { maxWidth: 720 },
	card: { flex: 1, minHeight: 0, borderRadius: 18, gap: 6 },
	cardTransparent: { backgroundColor: "transparent" },
	controlsContainer: {
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 8,
		paddingTop: 6,
		paddingBottom: 10,
		marginBottom: 10,
	},
	controls: { gap: 2, paddingBottom: 0 },
	searchControl: { paddingTop: 4 },
	groupTabsWrap: {
		paddingTop: 2,
	},
	listSection: { flex: 1, minHeight: 0 },
	list: { flex: 1, minHeight: 0 },
	stateWrap: { paddingTop: 8, alignItems: "flex-start" },
	listContent: { gap: 0, paddingBottom: 200 },
	row: {
		borderWidth: 1,
		borderRadius: 12,
		marginBottom: 8,
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
	},
	pressArea: {
		flex: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 2,
	},
	left: {
		flex: 1,
		minWidth: 0,
	},
	textBlock: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	nameRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minWidth: 0,
	},
	nameText: {
		flex: 1,
		minWidth: 0,
		fontWeight: "500",
	},
	countText: {
		marginLeft: 0,
	},
	rightSide: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginLeft: 6,
	},
	rightMeta: {
		alignItems: "flex-end",
		minWidth: 102,
	},
	addCircle: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyWrap: { padding: 12, borderRadius: 12, gap: 4 },
	emptyAction: { marginTop: 6, alignSelf: "center" },
});
