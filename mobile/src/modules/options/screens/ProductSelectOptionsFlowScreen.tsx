import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BAIButton } from "@/components/ui/BAIButton";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISearchBar } from "@/components/ui/BAISearchBar";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { useAppBusy } from "@/hooks/useAppBusy";
import { useAppToast } from "@/providers/AppToastProvider";
import { useProductCreateDraft } from "@/modules/inventory/drafts/useProductCreateDraft";
import { mapInventoryRouteToScope, type InventoryRouteScope } from "@/modules/inventory/navigation.scope";
import { useOptionSetsList } from "@/modules/options/options.queries";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import {
	PRODUCT_CREATE_OPTION_ROUTE,
	PRODUCT_CREATE_VARIATIONS_ROUTE,
	DRAFT_ID_KEY,
	OPTION_SET_ID_KEY,
	PRODUCT_ID_KEY,
	PRODUCT_OPTION_VALUES_ROUTE,
	PRODUCT_SELECT_OPTIONS_ROUTE,
	ROOT_RETURN_TO_KEY,
	RETURN_TO_KEY,
	normalizeReturnTo,
} from "@/modules/options/productOptionPicker.contract";

function clampText(value: string, maxLength: number): string {
	if (maxLength <= 0) return "";
	return String(value ?? "").slice(0, maxLength);
}

function buildSelectionSignature(
	selections: {
		optionSetId: string;
		selectedValueIds: string[];
		sortOrder: number;
	}[],
): string {
	return selections
		.slice()
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map((selection) => {
			const selectedValueIds = [...selection.selectedValueIds].sort((a, b) => a.localeCompare(b));
			return `${selection.optionSetId}:${selectedValueIds.join(",")}`;
		})
		.join("|");
}

export function ProductSelectOptionsFlowScreen({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const params = useLocalSearchParams();
	const theme = useTheme();
	const { withBusy, busy } = useAppBusy();
	const { showError } = useAppToast();

	const draftId = String(params[DRAFT_ID_KEY] ?? "").trim();
	const productId = String(params[PRODUCT_ID_KEY] ?? "").trim();
	const { draft, patch } = useProductCreateDraft(draftId || undefined);
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const thisRoute = useMemo(() => toScopedRoute(PRODUCT_SELECT_OPTIONS_ROUTE), [toScopedRoute]);
	const fallbackReturnTo = useMemo(() => {
		if (productId) {
			return toScopedRoute(`/(app)/(tabs)/inventory/products/${encodeURIComponent(productId)}/edit`);
		}
		return toScopedRoute("/(app)/(tabs)/inventory/products/create");
	}, [productId, toScopedRoute]);
	const returnTo = useMemo(
		() => normalizeReturnTo(params[RETURN_TO_KEY]) ?? fallbackReturnTo,
		[fallbackReturnTo, params],
	);
	const rootReturnTo = useMemo(() => normalizeReturnTo(params[ROOT_RETURN_TO_KEY]) ?? returnTo, [params, returnTo]);

	const query = useOptionSetsList(false);
	const items = useMemo(() => query.data ?? [], [query.data]);
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const isUiDisabled = busy.isBusy;
	const [searchText, setSearchText] = useState("");
	const draftSelectedIds = useMemo(() => draft.selectedOptionSetIds, [draft.selectedOptionSetIds]);
	const [selectedIds, setSelectedIds] = useState<string[]>(() => draftSelectedIds);
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const hadExistingSelections = draft.optionSelections.length > 0 || draft.selectedOptionSetIds.length > 0;
	const filteredItems = useMemo(() => {
		const q = searchText.trim().toLowerCase();
		if (!q) return items;
		return items.filter((item) => {
			if (item.name.toLowerCase().includes(q)) return true;
			return item.values.some((value) => value.name.toLowerCase().includes(q));
		});
	}, [items, searchText]);
	const selectedRows = useMemo(() => {
		const byId = new Map(items.map((item) => [item.id, item]));
		return selectedIds
			.map((id) => {
				const set = byId.get(id);
				if (!set) return null;
				const selection = draft.optionSelections.find((row) => row.optionSetId === id);
				const names = selection && selection.selectedValueNames.length > 0 ? selection.selectedValueNames : [];
				return {
					id: set.id,
					name: selection?.optionSetName || set.displayName || set.name,
					selectedNames: names,
				};
			})
			.filter((row): row is NonNullable<typeof row> => !!row);
	}, [draft.optionSelections, items, selectedIds]);

	useEffect(() => {
		setSelectedIds((prev) => {
			if (prev.length === draftSelectedIds.length && prev.every((id, index) => id === draftSelectedIds[index])) {
				return prev;
			}
			return draftSelectedIds;
		});
	}, [draftSelectedIds]);

	const onBack = useCallback(() => {
		router.replace({
			pathname: returnTo as any,
			params: {
				[DRAFT_ID_KEY]: draft.draftId,
				...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
			} as any,
		});
	}, [draft.draftId, productId, returnTo, router]);

	const onSave = useCallback(async () => {
		if (selectedIds.length === 0) {
			await withBusy("Clearing options...", async () => {
				patch({
					selectedOptionSetIds: [],
					selectedVariationKeys: [],
					variationSelectionInitialized: false,
					optionSelections: [],
					variations: [],
				});
				router.replace({
					pathname: returnTo as any,
					params: {
						[DRAFT_ID_KEY]: draft.draftId,
						...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
					} as any,
				});
			});
			return;
		}

		const byId = new Map(items.map((item) => [item.id, item]));
		const emptyValueSelections = selectedIds
			.map((id) => byId.get(id))
			.filter((item): item is NonNullable<typeof item> => !!item)
			.filter((item) => item.values.length === 0);
		if (emptyValueSelections.length > 0) {
			showError("Select an option set with values, or add values first.");
			return;
		}

		const nextSelections = selectedIds
			.map((id, index) => {
				const set = byId.get(id);
				if (!set) return null;
				const existing = draft.optionSelections.find((row) => row.optionSetId === id);
				const selectedValues = set.values.filter((value) => existing?.selectedValueIds.includes(value.id));
				return {
					optionSetId: id,
					optionSetName: existing?.optionSetName || set.displayName || set.name,
					selectedValueIds: selectedValues.map((value) => value.id),
					selectedValueNames: selectedValues.map((value) => value.name),
					sortOrder: index,
				};
			})
			.filter((value): value is NonNullable<typeof value> => !!value);

		await withBusy("Preparing variations...", async () => {
			const existingSignature = buildSelectionSignature(draft.optionSelections);
			const nextSignature = buildSelectionSignature(nextSelections);
			const nextDraftPatch =
				existingSignature === nextSignature
					? { selectedOptionSetIds: selectedIds, optionSelections: nextSelections }
					: {
							selectedOptionSetIds: selectedIds,
							selectedVariationKeys: [],
							variationSelectionInitialized: false,
							optionSelections: nextSelections,
						};
			patch(nextDraftPatch);

			const firstIncompleteSelection = nextSelections.find((selection) => selection.selectedValueIds.length === 0);
			if (firstIncompleteSelection) {
				router.replace({
					pathname: toScopedRoute(PRODUCT_OPTION_VALUES_ROUTE) as any,
					params: {
						[DRAFT_ID_KEY]: draft.draftId,
						[OPTION_SET_ID_KEY]: firstIncompleteSelection.optionSetId,
						[RETURN_TO_KEY]: thisRoute,
						[ROOT_RETURN_TO_KEY]: rootReturnTo,
						...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
					} as any,
				});
				return;
			}

			router.replace({
				pathname: toScopedRoute(PRODUCT_CREATE_VARIATIONS_ROUTE) as any,
				params: {
					[DRAFT_ID_KEY]: draft.draftId,
					[RETURN_TO_KEY]: rootReturnTo,
					[ROOT_RETURN_TO_KEY]: rootReturnTo,
					...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
				} as any,
			});
		});
	}, [
		draft.draftId,
		draft.optionSelections,
		items,
		patch,
		productId,
		returnTo,
		rootReturnTo,
		router,
		selectedIds,
		showError,
		thisRoute,
		toScopedRoute,
		withBusy,
	]);

	const onToggle = useCallback(
		(id: string) => {
			if (isUiDisabled) return;
			setSelectedIds((prev) => {
				const nextSelectedIds = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
				patch({ selectedOptionSetIds: nextSelectedIds });
				return nextSelectedIds;
			});
		},
		[isUiDisabled, patch],
	);

	const topSection = (
		<View
			style={[
				styles.topSection,
				{
					borderBottomColor: theme.colors.outlineVariant ?? theme.colors.outline,
					backgroundColor: theme.colors.surface,
				},
			]}
		>
			<View style={styles.topActionsRow}>
				<BAIButton
					mode='contained'
					shape='pill'
					style={styles.topActionButton}
					onPress={() => {
						if (isUiDisabled) return;
						router.replace({
							pathname: toScopedRoute(PRODUCT_CREATE_OPTION_ROUTE) as any,
							params: {
								[DRAFT_ID_KEY]: draft.draftId,
								[RETURN_TO_KEY]: thisRoute,
								[ROOT_RETURN_TO_KEY]: rootReturnTo,
								...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
							} as any,
						});
					}}
					disabled={isUiDisabled}
				>
					Create Option
				</BAIButton>
				<BAIButton
					mode='contained'
					shape='pill'
					style={styles.topActionButton}
					onPress={onSave}
					disabled={isUiDisabled || (selectedIds.length === 0 && !hadExistingSelections)}
				>
					{selectedIds.length === 0 ? "Done" : "Next"}
				</BAIButton>
			</View>
			<BAISearchBar
				value={searchText}
				onChangeText={(value) => setSearchText(clampText(value, FIELD_LIMITS.search))}
				maxLength={FIELD_LIMITS.search}
				placeholder='Search options'
				disabled={isUiDisabled}
			/>
		</View>
	);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom style={styles.root}>
				<View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
					<BAIHeader title='Select options' variant='exit' onLeftPress={onBack} />
					<BAISurface style={[styles.card, { borderColor }]} padded={false}>
						{topSection}
						{query.isLoading ? (
							<View style={styles.stateScreenWrap}>
								<View style={styles.stateWrap}>
									<BAIText variant='body' muted>
										Loading options...
									</BAIText>
								</View>
							</View>
						) : query.isError ? (
							<View style={styles.stateScreenWrap}>
								<View style={styles.stateWrap}>
									<BAIRetryButton compact onPress={() => query.refetch()}>
										Retry
									</BAIRetryButton>
								</View>
							</View>
						) : (
							<>
								<FlatList
									data={filteredItems}
									keyExtractor={(item) => item.id}
									style={styles.optionsList}
									contentContainerStyle={styles.listContent}
									keyboardShouldPersistTaps='handled'
									ListHeaderComponent={
										<View>
											{selectedRows.length > 0 ? (
												<View
													style={[
														styles.selectedWrap,
														{ borderBottomColor: theme.colors.outlineVariant ?? theme.colors.outline },
													]}
												>
													{selectedRows.map((row) => (
														<View
															key={row.id}
															style={[
																styles.selectedRow,
																{
																	borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
																	backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
																},
															]}
														>
															<View style={styles.rowMain}>
																<BAIText variant='subtitle'>{row.name}</BAIText>
																<BAIText variant='caption' muted numberOfLines={1}>
																	{row.selectedNames.length > 0 ? row.selectedNames.join(", ") : "No options selected"}
																</BAIText>
															</View>
															<MaterialCommunityIcons
																name='chevron-right'
																size={26}
																color={theme.colors.onSurfaceVariant}
																onPress={() => {
																	if (isUiDisabled) return;
																	router.replace({
																		pathname: toScopedRoute(PRODUCT_OPTION_VALUES_ROUTE) as any,
																		params: {
																			[DRAFT_ID_KEY]: draft.draftId,
																			[RETURN_TO_KEY]: thisRoute,
																			[ROOT_RETURN_TO_KEY]: rootReturnTo,
																			[OPTION_SET_ID_KEY]: row.id,
																			...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
																		} as any,
																	});
																}}
															/>
														</View>
													))}
												</View>
											) : null}
											<View
												style={[
													styles.optionsTitleWrap,
													{ borderBottomColor: theme.colors.outlineVariant ?? theme.colors.outline },
												]}
											>
												<BAIText variant='subtitle'>Options</BAIText>
											</View>
										</View>
									}
									ListEmptyComponent={
										<View style={styles.stateWrap}>
											<BAIText variant='body' muted>
												{items.length === 0 ? "No options found." : "No options match your search."}
											</BAIText>
										</View>
									}
									renderItem={({ item }) => {
										const checked = selectedSet.has(item.id);
										return (
											<View
												style={[
													styles.row,
													{
														borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
														backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
													},
												]}
											>
												<View style={styles.rowMain}>
													<BAIText variant='subtitle'>{item.name}</BAIText>
													<BAIText variant='caption' muted numberOfLines={1}>
														{item.values.map((value) => value.name).join(", ") || "No values yet"}
													</BAIText>
												</View>
												<Pressable
													onPress={() => onToggle(item.id)}
													hitSlop={8}
													android_ripple={{ color: "transparent", borderless: true }}
													style={styles.switchPressable}
												>
													<MaterialCommunityIcons
														name={checked ? "toggle-switch" : "toggle-switch-off-outline"}
														size={38}
														color={checked ? theme.colors.primary : theme.colors.onSurfaceVariant}
													/>
												</Pressable>
											</View>
										);
									}}
								/>
							</>
						)}
					</BAISurface>
				</View>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	screen: { flex: 1, minHeight: 0, paddingHorizontal: 10, paddingTop: 0, paddingBottom: 0 },
	card: {
		flex: 1,
		minHeight: 0,
		borderWidth: 1,
		borderRadius: 24,
		gap: 4,
		paddingHorizontal: 0,
		paddingTop: 10,
		paddingBottom: 0,
		marginTop: 0,
		overflow: "hidden",
	},
	topSection: {
		paddingHorizontal: 12,
		paddingTop: 0,
		paddingBottom: 10,
		gap: 8,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	topActionsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	topActionButton: {
		flex: 1,
	},
	stateScreenWrap: { flex: 1, minHeight: 0 },
	stateWrap: { flex: 1, minHeight: 180, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
	listContent: { paddingBottom: 12 },
	optionsList: { flex: 1, minHeight: 0 },
	optionsTitleWrap: {
		paddingHorizontal: 14,
		paddingTop: 10,
		paddingBottom: 8,
		borderBottomWidth: 0,
	},
	selectedWrap: {
		paddingHorizontal: 4,
		paddingTop: 6,
		paddingBottom: 6,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	selectedRow: {
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		marginHorizontal: 8,
		marginBottom: 8,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	row: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		marginHorizontal: 8,
		marginBottom: 8,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	rowMain: { flex: 1, gap: 2 },
	switchPressable: {
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 20,
	},
});
