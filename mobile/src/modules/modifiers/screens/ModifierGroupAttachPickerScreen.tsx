import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, Pressable, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BAIButton } from "@/components/ui/BAIButton";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISearchBar } from "@/components/ui/BAISearchBar";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { useAppBusy } from "@/hooks/useAppBusy";
import { formatCompactNumber } from "@/lib/locale/businessLocale";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { modifiersApi } from "@/modules/modifiers/modifiers.api";
import type { ModifierGroup } from "@/modules/modifiers/modifiers.types";
import {
	buildModifierSelectionParams,
	DRAFT_ID_KEY,
	MODIFIER_PICKER_ROUTE,
	normalizeReturnTo,
	parseModifierSelectionParams,
	RETURN_TO_KEY,
	type ModifierPickerInboundParams,
} from "@/modules/modifiers/modifierPicker.contract";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import { sanitizeSearchInput } from "@/shared/validation/sanitize";

const modifierPickerKey = ["modifiers", "groups", "attach-picker-screen"] as const;
const INVENTORY_MODIFIER_CREATE_ROUTE = "/(app)/(tabs)/inventory/modifiers/create" as const;

export function ModifierGroupAttachPickerScreen() {
	const router = useRouter();
	const theme = useTheme();
	const params = useLocalSearchParams<ModifierPickerInboundParams>();
	const { busy } = useAppBusy();
	const { countryCode } = useActiveBusinessMeta();
	const pickerRoute = MODIFIER_PICKER_ROUTE;
	const createRoute = INVENTORY_MODIFIER_CREATE_ROUTE;

	const returnTo = useMemo(
		() => normalizeReturnTo(params[RETURN_TO_KEY]) ?? "/(app)/(tabs)/inventory/products/create",
		[params],
	);

	const parsedSelection = useMemo(() => parseModifierSelectionParams(params), [params]);
	const selectionSignature = useMemo(
		() => parsedSelection.selectedModifierGroupIds.join("|"),
		[parsedSelection.selectedModifierGroupIds],
	);
	const draftId = useMemo(
		() => parsedSelection.draftId || String(params[DRAFT_ID_KEY] ?? "").trim(),
		[params, parsedSelection.draftId],
	);

	const [selectedIds, setSelectedIds] = useState<string[]>(() => parsedSelection.selectedModifierGroupIds);
	const [search, setSearch] = useState("");
	const lastHydratedSignatureRef = useRef<string>(selectionSignature);

	useEffect(() => {
		if (!parsedSelection.hasSelectionKey) return;
		if (lastHydratedSignatureRef.current === selectionSignature) return;
		lastHydratedSignatureRef.current = selectionSignature;
		setSelectedIds((prev) => {
			const next = parsedSelection.selectedModifierGroupIds;
			if (prev.length === next.length && prev.every((value, index) => value === next[index])) {
				return prev;
			}
			return next;
		});
	}, [parsedSelection.hasSelectionKey, parsedSelection.selectedModifierGroupIds, selectionSignature]);

	const navLockRef = useRef(false);
	const lockNav = useCallback((ms = 650) => {
		if (navLockRef.current) return false;
		navLockRef.current = true;
		setTimeout(() => {
			navLockRef.current = false;
		}, ms);
		return true;
	}, []);

	const isUiDisabled = !!busy?.isBusy;

	const dismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

	const query = useQuery({
		queryKey: modifierPickerKey,
		queryFn: () => modifiersApi.listGroups(false),
		staleTime: 30_000,
	});

	const items = useMemo(() => query.data ?? [], [query.data]);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return items;
		return items.filter((item) => item.name.toLowerCase().includes(q));
	}, [items, search]);

	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const selectedCountLabel = useMemo(
		() => formatCompactNumber(selectedIds.length, countryCode),
		[countryCode, selectedIds.length],
	);
	const initialSelectionSignature = useMemo(
		() => [...parsedSelection.selectedModifierGroupIds].sort().join("|"),
		[parsedSelection.selectedModifierGroupIds],
	);
	const currentSelectionSignature = useMemo(() => [...selectedIds].sort().join("|"), [selectedIds]);
	const isApplyDisabled = isUiDisabled || initialSelectionSignature === currentSelectionSignature;

	const onBack = useCallback(() => {
		dismissKeyboard();
		if (!lockNav()) return;
		router.replace(returnTo as any);
	}, [dismissKeyboard, lockNav, returnTo, router]);

	const onConfirm = useCallback(() => {
		dismissKeyboard();
		if (!lockNav()) return;
		router.replace({
			pathname: returnTo as any,
			params: buildModifierSelectionParams({
				selectedModifierGroupIds: selectedIds,
				selectionSource: selectedIds.length ? "existing" : "cleared",
				draftId: draftId || undefined,
			}),
		});
	}, [dismissKeyboard, draftId, lockNav, returnTo, router, selectedIds]);

	const onClear = useCallback(() => {
		if (isUiDisabled) return;
		setSelectedIds([]);
	}, [isUiDisabled]);

	const onApplyAll = useCallback(() => {
		if (isUiDisabled) return;
		setSelectedIds(items.map((item) => item.id));
	}, [isUiDisabled, items]);

	const onCreate = useCallback(() => {
		dismissKeyboard();
		if (!lockNav()) return;
		router.push({
			pathname: createRoute as any,
			params: {
				[RETURN_TO_KEY]: pickerRoute,
				...buildModifierSelectionParams({
					selectedModifierGroupIds: selectedIds,
					selectionSource: selectedIds.length > 0 ? "existing" : "cleared",
					draftId: draftId || undefined,
				}),
			},
		} as any);
	}, [createRoute, dismissKeyboard, draftId, lockNav, pickerRoute, router, selectedIds]);

	const toggle = useCallback(
		(id: string) => {
			if (isUiDisabled) return;
			setSelectedIds((prev) => {
				if (prev.includes(id)) return prev.filter((value) => value !== id);
				return [...prev, id];
			});
		},
		[isUiDisabled],
	);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom style={styles.root}>
				<BAIHeader
					title='Select Modifier Sets'
					variant='back'
					onLeftPress={onBack}
					onRightPress={onConfirm}
					rightDisabled={isApplyDisabled}
					rightSlot={({ disabled }) => (
						<View
							style={[
								styles.headerApplyPill,
								{ backgroundColor: disabled ? theme.colors.surfaceDisabled : theme.colors.primary },
							]}
						>
							<BAIText
								variant='body'
								style={{
									color: disabled ? theme.colors.onSurfaceDisabled : theme.colors.onPrimary,
									fontSize: 16,
									fontWeight: "600",
								}}
							>
								Save
							</BAIText>
						</View>
					)}
				/>
				<TouchableWithoutFeedback onPress={dismissKeyboard} accessible={false}>
					<View style={styles.wrap}>
						<BAISurface
							style={[styles.card, { borderColor: theme.colors.outlineVariant ?? theme.colors.outline }]}
							bordered
						>
							<View style={styles.panelContent}>
								<BAISearchBar
									value={search}
									onChangeText={(value) => {
										const cleaned = sanitizeSearchInput(value);
										setSearch(cleaned.length > FIELD_LIMITS.search ? cleaned.slice(0, FIELD_LIMITS.search) : cleaned);
									}}
									placeholder='Search modifiers...'
									maxLength={FIELD_LIMITS.search}
									disabled={isUiDisabled}
								/>

								<View style={styles.actionRow}>
									<BAIButton
										mode='outlined'
										variant='outline'
										onPress={onClear}
										disabled={isUiDisabled}
										shape='pill'
										style={styles.actionButton}
									>
										Clear All
									</BAIButton>
									<BAIButton
										mode='outlined'
										variant='outline'
										onPress={onApplyAll}
										disabled={isUiDisabled || items.length === 0}
										shape='pill'
										style={styles.actionButton}
									>
										Apply All
									</BAIButton>
									<BAIButton
										mode='outlined'
										variant='outline'
										onPress={onCreate}
										disabled={isUiDisabled}
										shape='pill'
										style={styles.actionButton}
									>
										Create Set
									</BAIButton>
								</View>

								<BAIText variant='caption' muted style={styles.selectedCaption}>
									{selectedCountLabel} selected
								</BAIText>
							</View>

							<View style={styles.listContainer}>
								{query.isLoading ? (
									<View style={styles.stateWrap}>
										<BAIText variant='body' muted>
											Loading modifier sets...
										</BAIText>
									</View>
								) : query.isError ? (
									<View style={styles.stateWrap}>
										<BAIRetryButton compact onPress={() => query.refetch()}>
											Retry
										</BAIRetryButton>
									</View>
								) : filtered.length === 0 ? (
									<View style={styles.stateWrap}>
										<BAIText variant='body' muted>
											No modifier sets found.
										</BAIText>
									</View>
								) : (
									<FlatList
										data={filtered}
										keyExtractor={(item) => item.id}
										style={styles.list}
										renderItem={({ item }) => (
											<ModifierRow
												item={item}
												checked={selectedSet.has(item.id)}
												onPress={() => toggle(item.id)}
												disabled={isUiDisabled}
												countryCode={countryCode}
											/>
										)}
										contentContainerStyle={styles.listContent}
										keyboardShouldPersistTaps='handled'
										showsVerticalScrollIndicator={false}
										showsHorizontalScrollIndicator={false}
									/>
								)}
							</View>
						</BAISurface>
					</View>
				</TouchableWithoutFeedback>
			</BAIScreen>
		</>
	);
}

function ModifierRow({
	item,
	checked,
	onPress,
	disabled,
	countryCode,
}: {
	item: ModifierGroup;
	checked: boolean;
	onPress: () => void;
	disabled?: boolean;
	countryCode?: string | null;
}) {
	const theme = useTheme();
	const outline = theme.colors.outlineVariant ?? theme.colors.outline;
	const surfaceAlt = theme.colors.surfaceVariant ?? theme.colors.surface;
	const optionCountLabel = formatCompactNumber(item.options.length, countryCode);
	return (
		<BAISurface style={[styles.rowCard, { borderColor: outline, backgroundColor: surfaceAlt }]} padded>
			<Pressable
				onPress={onPress}
				disabled={disabled}
				style={({ pressed }) => [styles.row, pressed && !disabled && { opacity: 0.9 }, disabled && { opacity: 0.55 }]}
			>
				<View style={styles.rowText}>
					<BAIText variant='subtitle' numberOfLines={1}>
						{item.name}
					</BAIText>
					<BAIText variant='caption' muted numberOfLines={1}>
						{optionCountLabel} option{item.options.length === 1 ? "" : "s"}
					</BAIText>
				</View>
				<MaterialCommunityIcons
					name={checked ? "check-circle" : "checkbox-blank-circle-outline"}
					size={28}
					color={checked ? theme.colors.primary : (theme.colors.onSurfaceVariant ?? theme.colors.onSurface)}
				/>
			</Pressable>
		</BAISurface>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	wrap: { flex: 1, minHeight: 0, paddingHorizontal: 10, paddingBottom: 0, paddingTop: 0 },
	card: { flex: 1, minHeight: 0, gap: 8 },
	panelContent: { gap: 6 },
	headerApplyPill: {
		minWidth: 90,
		height: 40,
		borderRadius: 20,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	actionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	actionButton: { flex: 1 },
	selectedCaption: { alignSelf: "flex-end", marginTop: 2 },
	listContainer: {
		flex: 1,
		minHeight: 0,
	},
	list: { flex: 1, minHeight: 0 },
	stateWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		padding: 16,
	},
	listContent: { paddingTop: 0, paddingBottom: 0, gap: 0 },
	rowCard: {
		borderWidth: 1,
		borderRadius: 12,
		paddingVertical: 6,
	},
	row: {
		minHeight: 36,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 6,
	},
	rowText: { flex: 1, marginRight: 8, minWidth: 0, gap: 0 },
});
