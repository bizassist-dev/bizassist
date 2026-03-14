import { useCallback, useMemo, useState } from "react";
import { FlatList, InteractionManager, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Switch, useTheme } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmActionModal } from "@/components/settings/ConfirmActionModal";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { useAppBusy } from "@/hooks/useAppBusy";
import { useResponsiveLayout } from "@/lib/layout/useResponsiveLayout";
import { formatCompactNumber } from "@/lib/locale/businessLocale";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { runGovernedProcessExit } from "@/modules/inventory/navigation.governance";
import { useInventoryHeader } from "@/modules/inventory/useInventoryHeader";
import { useAppHeader } from "@/modules/navigation/useAppHeader";
import { modifiersApi } from "@/modules/modifiers/modifiers.api";
import { updateModifierGroupArchiveState } from "@/modules/modifiers/modifiers.cache";
import { getModifierCardBackgroundColor } from "@/modules/modifiers/modifierColors";
import type { SharedModifierAvailabilityPreview } from "@/modules/modifiers/modifiers.types";
import { useAppToast } from "@/providers/AppToastProvider";

const HEADER_SIDE_PADDING_FALLBACK = 16;
const HEADER_RAIL_SIZE = 56;
const HEADER_TITLE_SAFETY_GAP = 28;
const HEADER_TITLE_ESTIMATED_CHAR_WIDTH = 10;
const HEADER_TITLE_HORIZONTAL_PADDING = 18;
const DEV_SCROLL_TEST_OPTION_COUNT = 18;

function truncateHeaderTitle(value: string, maxLength: number): string {
	const safe = String(value ?? "").trim();
	if (!safe) return "";
	if (safe.length <= maxLength) return safe;
	return `${safe.slice(0, maxLength).trimEnd()}...`;
}

export function ModifierGroupDetailScreen({ mode }: { mode: "settings" | "inventory" }) {
	const router = useRouter();
	const { width: viewportWidth } = useWindowDimensions();
	const { paddingX } = useResponsiveLayout();
	const theme = useTheme();
	const params = useLocalSearchParams<{ id?: string; returnTo?: string }>();
	const groupId = String(params.id ?? "").trim();
	const exitReturnTo = String(params.returnTo ?? "").trim();
	const queryClient = useQueryClient();
	const { countryCode } = useActiveBusinessMeta();
	const { withBusy, busy } = useAppBusy();
	const { showSuccess } = useAppToast();
	const baseRoute = mode === "settings" ? "/(app)/(tabs)/settings/modifiers" : "/(app)/(tabs)/inventory/modifiers";
	const activeListRoute = `${baseRoute}?filter=active`;
	const archivedListRoute = `${baseRoute}?filter=archived`;
	const [sharedAvailabilityOpen, setSharedAvailabilityOpen] = useState(false);
	const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
	const [sharedAvailability, setSharedAvailability] = useState<SharedModifierAvailabilityPreview | null>(null);
	const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
	const [pendingOptionId, setPendingOptionId] = useState<string>("");
	const [pendingNextIsSoldOut, setPendingNextIsSoldOut] = useState<boolean>(false);

	const outline = theme.colors.outlineVariant ?? theme.colors.outline;
	const surfaceAlt = theme.colors.surfaceVariant ?? theme.colors.surface;
	const modifierCardBackgroundColor = getModifierCardBackgroundColor(theme);

	const query = useQuery({
		queryKey: ["modifiers", "group", groupId],
		queryFn: () => modifiersApi.getGroup(groupId),
		enabled: !!groupId,
	});

	const group = query.data;
	const visibleOptions = useMemo(() => (group?.options ?? []).filter((option) => !option.isArchived), [group?.options]);
	const listOptions = useMemo(() => {
		if (!__DEV__ || visibleOptions.length >= DEV_SCROLL_TEST_OPTION_COUNT || visibleOptions.length === 0) {
			return visibleOptions;
		}

		const seedOption = visibleOptions[0];
		const needed = DEV_SCROLL_TEST_OPTION_COUNT - visibleOptions.length;
		const syntheticOptions = Array.from({ length: needed }, (_, index) => ({
			...seedOption,
			id: `__dev-scroll-option-${index + 1}`,
			name: `Test Modifier ${index + 1}`,
			isSoldOut: index % 3 === 0,
		}));

		return [...visibleOptions, ...syntheticOptions];
	}, [visibleOptions]);
	const headerHorizontalPadding = paddingX || HEADER_SIDE_PADDING_FALLBACK;
	const headerTitleMaxLength = useMemo(() => {
		const rightReservedWidth = HEADER_RAIL_SIZE;
		const availableWidth =
			viewportWidth -
			headerHorizontalPadding * 2 -
			HEADER_RAIL_SIZE -
			rightReservedWidth -
			HEADER_TITLE_SAFETY_GAP -
			HEADER_TITLE_HORIZONTAL_PADDING * 2;
		return Math.max(8, Math.floor(availableWidth / HEADER_TITLE_ESTIMATED_CHAR_WIDTH));
	}, [headerHorizontalPadding, viewportWidth]);
	const modifierHeaderTitle = useMemo(
		() => truncateHeaderTitle(group?.name ?? "", headerTitleMaxLength) || "Modifier Set",
		[group?.name, headerTitleMaxLength],
	);

	const onToggleSoldOut = useCallback(
		(optionId: string, isSoldOut: boolean) => {
			if (optionId.startsWith("__dev-scroll-option-")) return;
			const nextIsSoldOut = !isSoldOut;
			withBusy("Checking modifier sets...", async () => {
				const preview = await modifiersApi.getSharedAvailability(optionId);
				if ((preview.groups ?? []).length <= 1) {
					await modifiersApi.updateOption(optionId, { isSoldOut: nextIsSoldOut });
					await query.refetch();
					showSuccess(`This modifier has been marked as ${nextIsSoldOut ? "sold out" : "available"}`);
					return;
				}

				setSharedAvailability(preview);
				setSelectedGroupIds(preview.groups.map((entry) => entry.modifierGroupId));
				setPendingOptionId(optionId);
				setPendingNextIsSoldOut(nextIsSoldOut);
				setSharedAvailabilityOpen(true);
			});
		},
		[query, showSuccess, withBusy],
	);

	const closeSharedAvailability = useCallback(() => {
		setSharedAvailabilityOpen(false);
		setSharedAvailability(null);
		setSelectedGroupIds([]);
		setPendingOptionId("");
	}, []);

	const toggleGroupSelection = useCallback((modifierGroupId: string) => {
		setSelectedGroupIds((prev) =>
			prev.includes(modifierGroupId) ? prev.filter((entry) => entry !== modifierGroupId) : [...prev, modifierGroupId],
		);
	}, []);

	const onApplySharedAvailability = useCallback(() => {
		if (!pendingOptionId || selectedGroupIds.length === 0) return;
		const optionId = pendingOptionId;
		const modifierGroupIds = [...selectedGroupIds];
		const nextIsSoldOut = pendingNextIsSoldOut;

		closeSharedAvailability();
		InteractionManager.runAfterInteractions(() => {
			withBusy("Updating modifiers...", async () => {
				await modifiersApi.applySharedAvailability(optionId, {
					isSoldOut: nextIsSoldOut,
					modifierGroupIds,
				});
				await query.refetch();
				showSuccess(`This modifier has been marked as ${nextIsSoldOut ? "sold out" : "available"}`);
			});
		});
	}, [closeSharedAvailability, pendingNextIsSoldOut, pendingOptionId, query, selectedGroupIds, showSuccess, withBusy]);

	const onBackToList = useCallback(() => {
		const fallbackRoute = exitReturnTo || (group?.isArchived ? archivedListRoute : baseRoute);
		runGovernedProcessExit(undefined, fallbackRoute, { router: router as any });
	}, [archivedListRoute, baseRoute, exitReturnTo, group?.isArchived, router]);

	const onEditGroup = useCallback(() => {
		if (!group) return;
		const editRoute = `${baseRoute}/${group.id}/edit`;
		const returnTo = exitReturnTo || (group.isArchived ? archivedListRoute : baseRoute);
		router.push(`${editRoute}?returnTo=${encodeURIComponent(returnTo)}` as any);
	}, [archivedListRoute, baseRoute, exitReturnTo, group, router]);

	const onOpenRestoreConfirm = useCallback(() => {
		if (!group?.isArchived) return;
		setConfirmRestoreOpen(true);
	}, [group?.isArchived]);

	const onCloseRestoreConfirm = useCallback(() => {
		setConfirmRestoreOpen(false);
	}, []);

	const onConfirmRestoreGroup = useCallback(() => {
		if (!group?.id || !group.isArchived) return;
		withBusy("Restoring modifier set...", async () => {
			await modifiersApi.restoreGroup(group.id);
			updateModifierGroupArchiveState(queryClient, group.id, false);
			await queryClient.invalidateQueries({ queryKey: ["modifiers"] });
			setConfirmRestoreOpen(false);
			showSuccess("Modifier set restored");
			runGovernedProcessExit(undefined, activeListRoute, { router: router as any });
		});
	}, [activeListRoute, group?.id, group?.isArchived, queryClient, router, showSuccess, withBusy]);

	const headerBase = useAppHeader("detail", {
		title: modifierHeaderTitle,
		onBack: onBackToList,
	});
	const inventoryHeaderBase = useInventoryHeader("detail", {
		title: modifierHeaderTitle,
		onBack: onBackToList,
	});
	const header = useMemo(
		() => ({
			...(mode === "settings" ? headerBase : inventoryHeaderBase),
			header: () => (
				<BAIHeader
					title={modifierHeaderTitle}
					variant='back'
					titleHorizontalPadding={HEADER_TITLE_HORIZONTAL_PADDING}
					onLeftPress={onBackToList}
				/>
			),
		}),
		[headerBase, inventoryHeaderBase, mode, modifierHeaderTitle, onBackToList],
	);
	const sharedAvailabilityGroupCountLabel = useMemo(
		() => formatCompactNumber(sharedAvailability?.groups.length ?? 0, countryCode),
		[countryCode, sharedAvailability?.groups.length],
	);

	return (
		<>
			<Stack.Screen options={header} />
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom={false} safeAreaGradientBottom style={styles.root}>
				<View style={styles.wrap}>
					<View style={styles.content}>
						{query.isLoading ? (
							<View style={styles.stateWrap}>
								<BAIText variant='body'>Loading modifier set...</BAIText>
							</View>
						) : query.isError || !group ? (
							<View style={styles.stateWrap}>
								<BAIRetryButton onPress={() => query.refetch()}>Retry</BAIRetryButton>
							</View>
						) : (
							<>
								<View
									style={[
										styles.headerControlsContainer,
										{ borderColor: outline, backgroundColor: theme.colors.surface },
									]}
								>
									{!group.isArchived ? (
										<View style={styles.topActionRow}>
											<BAIButton
												variant='outline'
												intent='neutral'
												shape='pill'
												widthPreset='standard'
												style={styles.topActionButton}
												onPress={onBackToList}
												disabled={busy.isBusy}
											>
												Cancel
											</BAIButton>
											<BAIButton
												shape='pill'
												widthPreset='standard'
												style={styles.topActionButton}
												onPress={onEditGroup}
												disabled={busy.isBusy}
											>
												Edit
											</BAIButton>
										</View>
									) : null}
									<View style={[styles.tableHead, { borderBottomColor: outline }]}>
										<BAIText variant='subtitle'>Modifiers</BAIText>
										<BAIText variant='subtitle'>Availability</BAIText>
									</View>
								</View>

								<View style={styles.rowsListWrap}>
									<FlatList
										data={listOptions}
										keyExtractor={(item) => item.id}
										style={styles.rowsList}
										renderItem={({ item }) => (
											<BAISurface
												style={[
													styles.optionRow,
													{ borderColor: outline, backgroundColor: modifierCardBackgroundColor },
												]}
											>
												<View style={styles.optionInlineContent}>
													<BAIText variant='body' numberOfLines={1} ellipsizeMode='tail' style={styles.optionNameText}>
														{item.name}
													</BAIText>
													<View style={styles.optionAvailabilityInline}>
														{item.isSoldOut ? (
															<BAIText variant='body' style={{ color: theme.colors.error }}>
																Sold out
															</BAIText>
														) : (
															<BAIText variant='body'>Available</BAIText>
														)}
														<Switch
															value={!item.isSoldOut}
															disabled={group.isArchived || item.id.startsWith("__dev-scroll-option-")}
															onValueChange={() => onToggleSoldOut(item.id, item.isSoldOut)}
														/>
													</View>
												</View>
											</BAISurface>
										)}
										contentContainerStyle={styles.listContent}
										keyboardShouldPersistTaps='handled'
										showsVerticalScrollIndicator={false}
										ListEmptyComponent={
											<BAIText variant='body' muted style={styles.emptyOptionsText}>
												No active modifiers.
											</BAIText>
										}
										ListFooterComponent={
											group.isArchived
												? () => (
														<View style={styles.restoreActionWrap}>
															<BAIButton
																widthPreset='full'
																onPress={onOpenRestoreConfirm}
																disabled={busy.isBusy}
																labelStyle={styles.restoreActionLabel}
															>
																Restore Modifier Set
															</BAIButton>
														</View>
													)
												: null
										}
									/>
								</View>
							</>
						)}
					</View>
				</View>
			</BAIScreen>

			<Modal visible={sharedAvailabilityOpen} transparent animationType='slide' onRequestClose={() => {}}>
				<View style={styles.sheetBackdrop}>
					<View style={StyleSheet.absoluteFill} />
					<BAISurface style={[styles.sheet, { backgroundColor: theme.colors.surface }]} bordered radius={16}>
						<View style={styles.sheetHeaderRow}>
							<Pressable
								onPress={closeSharedAvailability}
								style={[
									styles.sheetCloseBtn,
									{
										backgroundColor:
											theme.colors.surfaceDisabled ?? theme.colors.surfaceVariant ?? theme.colors.surface,
										borderWidth: StyleSheet.hairlineWidth,
										borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
									},
								]}
							>
								<MaterialCommunityIcons
									name='close'
									size={24}
									color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
								/>
							</Pressable>
							<BAIButton onPress={onApplySharedAvailability} disabled={selectedGroupIds.length === 0} shape='pill'>
								Apply to all
							</BAIButton>
						</View>

						<BAIText variant='title'>Apply to all at this location</BAIText>
						<BAIText variant='body' muted>
							{`${sharedAvailability?.optionName ?? "This modifier"} is currently ${pendingNextIsSoldOut ? "available" : "sold out"} in ${sharedAvailabilityGroupCountLabel} modifier sets at this location. Do you want to mark them all as ${pendingNextIsSoldOut ? "sold out" : "available"}?`}
						</BAIText>

						<View style={styles.sheetListWrap}>
							<FlatList
								data={sharedAvailability?.groups ?? []}
								keyExtractor={(item) => item.modifierGroupId}
								renderItem={({ item }) => {
									const selected = selectedGroupIds.includes(item.modifierGroupId);
									return (
										<Pressable
											onPress={() => toggleGroupSelection(item.modifierGroupId)}
											style={[styles.sheetRow, { borderBottomColor: outline }]}
										>
											<BAIText variant='subtitle'>{item.modifierGroupName}</BAIText>
											<MaterialCommunityIcons
												name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
												size={28}
												color={selected ? theme.colors.primary : theme.colors.onSurfaceVariant}
											/>
										</Pressable>
									);
								}}
								showsVerticalScrollIndicator={false}
								keyboardShouldPersistTaps='handled'
							/>
						</View>
					</BAISurface>
				</View>
			</Modal>

			<ConfirmActionModal
				visible={confirmRestoreOpen}
				title='Restore Modifier Set'
				message='Restored modifier sets become available for new product and service attachments.'
				confirmLabel='Restore'
				confirmIntent='primary'
				confirmLabelStyle={styles.restoreModalLabel}
				cancelLabelStyle={styles.restoreModalLabel}
				onDismiss={onCloseRestoreConfirm}
				onCancel={onCloseRestoreConfirm}
				onConfirm={onConfirmRestoreGroup}
				disabled={busy.isBusy}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	wrap: { flex: 1, paddingHorizontal: 10, paddingBottom: 8 },
	content: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center", gap: 8 },
	headerControlsContainer: {
		gap: 2,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		paddingHorizontal: 10,
		paddingTop: 8,
		marginBottom: 2,
	},
	topActionRow: {
		flexDirection: "row",
		gap: 8,
		marginBottom: 6,
	},
	topActionButton: {
		flex: 1,
	},
	stateWrap: { paddingTop: 8, alignItems: "flex-start" },
	listContent: { gap: 0, paddingBottom: 6 },
	rowsListWrap: { flex: 1, minHeight: 0 },
	rowsList: { flex: 1, minHeight: 0 },
	emptyOptionsText: { paddingTop: 8 },
	restoreActionWrap: { paddingTop: 30 },
	restoreActionLabel: { fontWeight: "400" },
	restoreModalLabel: { fontWeight: "400" },
	tableHead: {
		paddingTop: 4,
		paddingBottom: 6,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	optionRow: {
		borderRadius: 12,
		borderWidth: 1,
		paddingVertical: 12,
		paddingHorizontal: 10,
		marginBottom: 8,
	},
	optionInlineContent: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
	},
	optionNameText: {
		flex: 1,
		minWidth: 0,
	},
	optionAvailabilityInline: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	sheetBackdrop: {
		flex: 1,
		justifyContent: "flex-end",
		backgroundColor: "rgba(0,0,0,0.4)",
	},
	sheet: {
		maxHeight: "80%",
		padding: 16,
		gap: 14,
		marginBottom: 0,
		borderBottomLeftRadius: 0,
		borderBottomRightRadius: 0,
	},
	sheetHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	sheetCloseBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	sheetListWrap: {
		maxHeight: 300,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: "transparent",
	},
	sheetRow: {
		minHeight: 58,
		borderBottomWidth: StyleSheet.hairlineWidth,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
});
