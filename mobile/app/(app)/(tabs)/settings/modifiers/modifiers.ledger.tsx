import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Keyboard, Pressable, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { SettingsScreenLayout, SettingsSectionTitle } from "@/components/settings/SettingsLayout";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIGroupTabs, type BAIGroupTab } from "@/components/ui/BAIGroupTabs";
import { BAISearchBar } from "@/components/ui/BAISearchBar";
import { formatCompactNumber } from "@/lib/locale/businessLocale";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { useAuth } from "@/modules/auth/AuthContext";
import { modifiersApi } from "@/modules/modifiers/modifiers.api";
import { ModifierLedgerFiltersCard } from "@/modules/modifiers/components/ModifierLedgerFiltersCard";
import { getModifierCardBackgroundColor } from "@/modules/modifiers/modifierColors";
import type { ModifierGroup } from "@/modules/modifiers/modifiers.types";
import { getUserAvatarInitials } from "@/modules/auth/auth.user";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import { sanitizeSearchInput } from "@/shared/validation/sanitize";

const modifierGroupsKey = ["modifiers", "groups", "settings"] as const;
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
	const rowNameColor = item.isArchived
		? (theme.colors.onSurfaceVariant ?? theme.colors.onSurface)
		: theme.colors.onSurface;
	const cardBackgroundColor = getModifierCardBackgroundColor(theme);
	return (
		<BAISurface
			style={[
				styles.row,
				{
					borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
					backgroundColor: cardBackgroundColor,
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
									{optionSummary.remainingCount > 0 ? `, +${optionSummary.remainingCount} more` : null}
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

export function ModifiersLedgerScreen({
	layout,
	mode = "settings",
}: {
	layout: "phone" | "tablet";
	mode?: "settings" | "inventory";
}) {
	const router = useRouter();
	const theme = useTheme();
	const params = useLocalSearchParams<{ filter?: string }>();
	const { countryCode } = useActiveBusinessMeta();
	const { user } = useAuth();
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<ModifierFilter>(() => resolveModifierFilter(params.filter));
	const baseRoute = mode === "settings" ? "/(app)/(tabs)/settings/modifiers" : "/(app)/(tabs)/inventory/modifiers";
	const backRoute = mode === "settings" ? "/(app)/(tabs)/settings" : "/(app)/(tabs)/inventory";
	const userAvatarInitials = useMemo(() => getUserAvatarInitials(user), [user]);

	useEffect(() => {
		setFilter(resolveModifierFilter(params.filter));
	}, [params.filter]);

	const groupsQuery = useQuery({
		queryKey: modifierGroupsKey,
		queryFn: () => modifiersApi.listGroups(true),
		staleTime: 30_000,
	});

	const onOpen = useCallback(
		(item: ModifierGroup) => {
			const detailRoute = `${baseRoute}/${encodeURIComponent(item.id)}`;
			const returnTo = `${baseRoute}?filter=${filter}`;
			router.push(`${detailRoute}?returnTo=${encodeURIComponent(returnTo)}` as any);
		},
		[baseRoute, filter, router],
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
		router.replace(backRoute as any);
	}, [backRoute, router]);

	const onCreate = useCallback(() => {
		router.push(`${baseRoute}/create` as any);
	}, [baseRoute, router]);

	const hasSearch = search.trim().length > 0;
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const modifierCardBackgroundColor = getModifierCardBackgroundColor(theme);

	return (
		<>
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom={false} style={styles.root}>
				<BAIHeader
					title='Modifiers'
					variant='back'
					onLeftPress={onCancel}
					rightRailWidth={118}
					rightSlot={({ disabled }) => (
						<View style={styles.headerActions}>
							<Pressable
								onPress={onCreate}
								disabled={disabled}
								accessibilityRole='button'
								accessibilityLabel='Create modifier set'
								hitSlop={8}
								style={({ pressed }) => [
									styles.addCircle,
									{ backgroundColor: theme.colors.primary, opacity: disabled ? 0.5 : 1 },
									pressed && !disabled ? styles.headerActionPressed : null,
								]}
							>
								<MaterialCommunityIcons name='plus' size={30} color={theme.colors.onPrimary} />
							</Pressable>
							<View
								style={[
									styles.headerAvatar,
									{
										borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
										backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
									},
								]}
							>
								<BAIText variant='subtitle' style={styles.headerAvatarText}>
									{userAvatarInitials}
								</BAIText>
							</View>
						</View>
					)}
				/>
				<TouchableWithoutFeedback onPress={dismissKeyboard} accessible={false}>
					<SettingsScreenLayout screenStyle={styles.layoutScreen} maxWidth={layout === "tablet" ? 720 : undefined}>
						<BAISurface style={[styles.card, { borderColor }]} padded bordered>
							<SettingsSectionTitle>Modifiers</SettingsSectionTitle>
							<ModifierLedgerFiltersCard
								borderColor={borderColor}
								backgroundColor={modifierCardBackgroundColor}
								search={
									<BAISearchBar
										value={search}
										onChangeText={(value) => {
											const cleaned = sanitizeSearchInput(value);
											setSearch(cleaned.length > FIELD_LIMITS.search ? cleaned.slice(0, FIELD_LIMITS.search) : cleaned);
										}}
										placeholder='Search modifiers...'
										maxLength={FIELD_LIMITS.search}
										onClear={hasSearch ? () => setSearch("") : undefined}
									/>
								}
								tabs={
									<BAIGroupTabs
										tabs={modifierTabs}
										value={filter}
										onChange={setFilter}
										countFormatter={(count) => formatCompactNumber(count, countryCode)}
									/>
								}
							/>

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
									/>
								)}
							</View>
						</BAISurface>
					</SettingsScreenLayout>
				</TouchableWithoutFeedback>
			</BAIScreen>
		</>
	);
}

export default function ModifiersLedgerRoute() {
	return <ModifiersLedgerScreen layout='phone' mode='settings' />;
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	layoutScreen: { paddingHorizontal: 8, paddingTop: 0 },
	card: { flex: 1, borderRadius: 18, gap: 6 },
	listSection: { flex: 1, minHeight: 0 },
	list: { flex: 1, minHeight: 0 },
	stateWrap: { paddingTop: 8, alignItems: "flex-start" },
	listContent: { gap: 0, paddingBottom: 4 },
	row: {
		borderWidth: 1,
		borderRadius: 12,
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 6,
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
	headerActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	headerActionPressed: {
		opacity: 0.78,
	},
	headerAvatar: {
		width: 50,
		height: 50,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
	},
	headerAvatarText: {
		fontWeight: "700",
		letterSpacing: 0.2,
	},
	addCircle: {
		width: 50,
		height: 50,
		borderRadius: 25,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyWrap: { padding: 12, borderRadius: 12, gap: 4 },
	emptyAction: { marginTop: 6, alignSelf: "flex-start" },
});
