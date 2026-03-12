import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";

import { BAIButton } from "@/components/ui/BAIButton";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIHeaderActionButton } from "@/components/ui/BAIHeaderActionButton";
import { BAINeutralCheckbox } from "@/components/ui/BAINeutralCheckbox";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAIText } from "@/components/ui/BAIText";
import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { inventoryApi } from "@/modules/inventory/inventory.api";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import { formatOnHandValue } from "@/modules/inventory/inventory.selectors";
import type { InventoryProduct } from "@/modules/inventory/inventory.types";
import { getModifierGroupDraft, upsertModifierGroupDraft } from "@/modules/modifiers/drafts/modifierGroupDraft";
import { unitDisplayToken } from "@/modules/units/units.format";
import { unitsApi } from "@/modules/units/units.api";
import { unitKeys } from "@/modules/units/units.queries";

type Props = {
	mode: "settings" | "inventory";
};

type RowItemProps = {
	item: InventoryProduct;
	selected: boolean;
	onToggle: (id: string) => void;
	abbreviationByUnitId: Map<string, string>;
	abbreviationByUnitName: Map<string, string>;
};

function normalizePerPieceAbbreviation(token: string, quantityValue: unknown): string {
	const normalized = String(token ?? "")
		.trim()
		.toLowerCase();
	if (!normalized) return "";

	if (normalized === "ea" || normalized === "each" || normalized === "pc" || normalized === "pcs") {
		return unitDisplayToken({ unitAbbreviation: "ea" }, "quantity", quantityValue) ?? "pcs";
	}

	return token.trim();
}

function isService(item: InventoryProduct): boolean {
	const normalized = String((item as any)?.type ?? "")
		.trim()
		.toUpperCase();
	return normalized === "SERVICE";
}

function getServiceDurationLabel(item: InventoryProduct): string | null {
	const total = Number((item as any)?.durationTotalMinutes);
	if (!Number.isFinite(total) || total <= 0) return null;
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	if (hours > 0 && minutes > 0) return `${hours} hr, ${minutes} mins`;
	if (hours > 0) return `${hours} hr`;
	return `${minutes} mins`;
}

function getItemStockWithUnitAbbreviationLabel(
	item: InventoryProduct,
	abbreviationByUnitId: Map<string, string>,
	abbreviationByUnitName: Map<string, string>,
): string {
	const valueLabel = formatOnHandValue(item);
	if (valueLabel === "—") return valueLabel;

	const quantityValue = (item as any)?.onHandCachedRaw ?? (item as any)?.onHandCached;
	const abbreviation = String((item as any)?.unitAbbreviation ?? (item as any)?.unit?.abbreviation ?? "").trim();
	const unitName = String((item as any)?.unitName ?? (item as any)?.unit?.name ?? "").trim();
	const unitId = String((item as any)?.unitId ?? "").trim();

	const fromUnitLookupById = normalizePerPieceAbbreviation(
		unitId ? (abbreviationByUnitId.get(unitId) ?? "") : "",
		quantityValue,
	);
	const fromUnitLookupByName = normalizePerPieceAbbreviation(
		unitName ? (abbreviationByUnitName.get(unitName.toLowerCase()) ?? "") : "",
		quantityValue,
	);
	const fromProductAbbreviation = normalizePerPieceAbbreviation(abbreviation, quantityValue);

	if (fromProductAbbreviation) return `${valueLabel} ${fromProductAbbreviation}`;
	if (fromUnitLookupById) return `${valueLabel} ${fromUnitLookupById}`;
	if (fromUnitLookupByName) return `${valueLabel} ${fromUnitLookupByName}`;

	const normalizedName = unitName.toLowerCase();
	if (normalizedName === "each" || normalizedName === "per piece") {
		const perPiece = unitDisplayToken({ unitName: "each" }, "quantity", quantityValue) ?? "pcs";
		return `${valueLabel} ${perPiece}`;
	}

	if (unitName) {
		const compact = unitName
			.split(/\s+/)
			.filter(Boolean)
			.map((part) => part[0])
			.join("")
			.toLowerCase();
		if (compact) return `${valueLabel} ${compact}`;
	}

	const eachToken = unitDisplayToken(
		{
			unitId: (item as any)?.unitId,
			unitName: (item as any)?.unitName ?? (item as any)?.unit?.name,
			unitAbbreviation: (item as any)?.unitAbbreviation ?? (item as any)?.unit?.abbreviation,
		},
		"quantity",
		quantityValue,
	);

	if (eachToken === "pc" || eachToken === "pcs") return `${valueLabel} ${eachToken}`;
	return valueLabel;
}

function ProductRow({ item, selected, onToggle, abbreviationByUnitId, abbreviationByUnitName }: RowItemProps) {
	const theme = useTheme();
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const onSurface = theme.colors.onSurface;
	const onSurfaceVariant = theme.colors.onSurfaceVariant ?? theme.colors.onSurface;

	const label = item.name?.trim() || "Unnamed";
	const durationLabel = isService(item) ? getServiceDurationLabel(item) : null;
	const subtitle = isService(item)
		? (durationLabel ?? "Service")
		: getItemStockWithUnitAbbreviationLabel(item, abbreviationByUnitId, abbreviationByUnitName);
	const rightMeta = item.category?.name?.trim() || "";
	const initials = label.slice(0, 2).toUpperCase();
	const imageUri = String(item.primaryImageUrl ?? "").trim();
	const [imageFailed, setImageFailed] = useState(false);
	const showImage = imageUri.length > 0 && !imageFailed;
	const placeholderThumbBg = theme.colors.surfaceDisabled ?? theme.colors.surfaceVariant ?? theme.colors.surface;

	useEffect(() => {
		setImageFailed(false);
	}, [imageUri]);

	return (
		<Pressable
			onPress={() => onToggle(item.id)}
			style={({ pressed }) => [
				styles.row,
				{ borderBottomColor: borderColor, backgroundColor: pressed ? theme.colors.surfaceVariant : "transparent" },
			]}
		>
			<View style={styles.rowLeft}>
				<View style={[styles.thumb, { borderColor, backgroundColor: showImage ? "transparent" : placeholderThumbBg }]}>
					{showImage ? (
						<Image
							source={{ uri: imageUri }}
							style={styles.thumbImage}
							resizeMode='cover'
							onError={() => setImageFailed(true)}
						/>
					) : (
						<BAIText variant='body' style={{ color: onSurfaceVariant }}>
							{initials}
						</BAIText>
					)}
				</View>
				<View style={styles.nameWrap}>
					<BAIText variant='subtitle' numberOfLines={1}>
						{label}
					</BAIText>
					<BAIText variant='caption' style={{ color: onSurfaceVariant }} numberOfLines={1}>
						{subtitle}
					</BAIText>
				</View>
			</View>

			<View style={styles.rowRight}>
				{rightMeta ? (
					<BAIText variant='body' style={{ color: onSurface }} numberOfLines={1}>
						{rightMeta}
					</BAIText>
				) : null}
				<BAINeutralCheckbox checked={selected} />
			</View>
		</Pressable>
	);
}

async function listAllProductsAndServices() {
	const all: InventoryProduct[] = [];
	let cursor: string | undefined;

	for (let page = 0; page < 20; page += 1) {
		const res = await inventoryApi.listProducts({
			includeArchived: false,
			limit: 100,
			cursor,
		});
		all.push(...(res.items ?? []));
		if (!res.nextCursor) break;
		cursor = res.nextCursor;
	}

	return all;
}

export function ModifierGroupApplySetPickerScreen({ mode }: Props) {
	const router = useRouter();
	const theme = useTheme();
	const params = useLocalSearchParams<{ draftId?: string; returnTo?: string }>();
	const draftId = String(params.draftId ?? "").trim();
	const backRoute = String(params.returnTo ?? "").trim() || "/(app)/(tabs)/inventory/modifiers/create";

	const [selectedIds, setSelectedIds] = useState<string[]>(() => {
		if (!draftId) return [];
		const draft = getModifierGroupDraft(draftId);
		return Array.isArray(draft?.appliedProductIds) ? draft.appliedProductIds : [];
	});

	const onBack = useCallback(() => {
		if (router.canGoBack?.()) {
			router.back();
			return;
		}
		router.replace({ pathname: backRoute as any, params: { draftId } as any });
	}, [backRoute, draftId, router]);

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;

	const productsQuery = useQuery({
		queryKey: [...inventoryKeys.productsRoot(), "apply-set", "all-active"],
		queryFn: listAllProductsAndServices,
		staleTime: 30_000,
	});

	const unitsQuery = useQuery({
		queryKey: unitKeys.list({ includeArchived: true }),
		queryFn: () => unitsApi.listUnits({ includeArchived: true }),
		staleTime: 30_000,
	});

	const abbreviationByUnitId = useMemo(() => {
		const map = new Map<string, string>();
		for (const unit of unitsQuery.data ?? []) {
			const id = String(unit?.id ?? "").trim();
			const abbr = String(unit?.abbreviation ?? "").trim();
			if (id && abbr) map.set(id, abbr);
		}
		return map;
	}, [unitsQuery.data]);

	const abbreviationByUnitName = useMemo(() => {
		const map = new Map<string, string>();
		for (const unit of unitsQuery.data ?? []) {
			const name = String(unit?.name ?? "")
				.trim()
				.toLowerCase();
			const abbr = String(unit?.abbreviation ?? "").trim();
			if (name && abbr) map.set(name, abbr);
		}
		return map;
	}, [unitsQuery.data]);

	const rows = useMemo(() => {
		const next = [...(productsQuery.data ?? [])];
		next.sort((a, b) => a.name.localeCompare(b.name));
		return next;
	}, [productsQuery.data]);
	const hasRows = rows.length > 0;

	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const allRowIds = useMemo(() => rows.map((item) => item.id), [rows]);

	const onToggle = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const exists = prev.includes(id);
			return exists ? prev.filter((value) => value !== id) : [...prev, id];
		});
	}, []);

	const onClearAll = useCallback(() => {
		setSelectedIds([]);
	}, []);

	const onApplyAll = useCallback(() => {
		setSelectedIds(allRowIds);
	}, [allRowIds]);

	const onApplySelection = useCallback(() => {
		if (draftId) {
			const draft = getModifierGroupDraft(draftId);
			if (draft) {
				upsertModifierGroupDraft(draftId, { appliedProductIds: selectedIds });
			}
		}
		router.replace({ pathname: backRoute as any, params: { draftId } as any });
	}, [backRoute, draftId, router, selectedIds]);

	return (
		<>
			<Stack.Screen
				options={{
					headerShown: true,
					header: () => (
						<BAIHeader
							title='Apply Set'
							variant='back'
							onLeftPress={onBack}
							onRightPress={onApplySelection}
							rightRailWidth={96}
							rightSlot={({ disabled }) => (
								<BAIHeaderActionButton label='Apply' variant='solid-primary' disabled={disabled} />
							)}
						/>
					),
				}}
			/>
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom={false} safeAreaGradientBottom>
				<View style={styles.screen}>
					<View style={styles.content}>
						<View style={[styles.actionContainer, { borderColor, backgroundColor: theme.colors.surface }]}>
							<View style={styles.actionRow}>
								<BAIButton
									variant='solid'
									intent='primary'
									shape='pill'
									onPress={onClearAll}
									style={styles.actionButton}
									disabled={productsQuery.isLoading || selectedIds.length === 0}
								>
									Clear All
								</BAIButton>
								<BAIButton
									variant='solid'
									intent='primary'
									shape='pill'
									onPress={onApplyAll}
									style={styles.actionButton}
									disabled={productsQuery.isLoading || rows.length === 0 || selectedIds.length === rows.length}
								>
									Add All
								</BAIButton>
							</View>
						</View>
						<View style={styles.listStateWrap}>
							{productsQuery.isLoading ? (
								<View style={styles.centerState}>
									<BAIActivityIndicator size='small' />
									<BAIText variant='body' muted>
										Loading items and services...
									</BAIText>
								</View>
							) : productsQuery.isError ? (
								<View style={styles.centerState}>
									<BAIText variant='body'>Could not load items and services.</BAIText>
								</View>
							) : !hasRows ? (
								<View style={styles.centerState}>
									<BAIText variant='body'>No items or services available yet.</BAIText>
									<BAIText variant='caption' muted style={styles.emptyCaption}>
										Create an item or service first, then apply this modifier set.
									</BAIText>
								</View>
							) : (
								<FlatList
									data={rows}
									keyExtractor={(item) => item.id}
									renderItem={({ item }) => (
										<ProductRow
											item={item}
											selected={selectedSet.has(item.id)}
											onToggle={onToggle}
											abbreviationByUnitId={abbreviationByUnitId}
											abbreviationByUnitName={abbreviationByUnitName}
										/>
									)}
									ItemSeparatorComponent={null}
									contentContainerStyle={styles.listContent}
									showsVerticalScrollIndicator={false}
								/>
							)}
						</View>
					</View>
				</View>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		paddingHorizontal: 12,
		paddingTop: 0,
	},
	content: {
		flex: 1,
	},
	actionContainer: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 14,
		paddingHorizontal: 10,
		paddingTop: 8,
		paddingBottom: 8,
		marginBottom: 10,
	},
	actionRow: {
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 0,
		paddingTop: 0,
		paddingBottom: 0,
	},
	actionButton: {
		flex: 1,
	},
	listStateWrap: {
		flex: 1,
		minHeight: 0,
	},
	centerState: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		padding: 16,
	},
	emptyCaption: {
		textAlign: "center",
	},
	listContent: {
		paddingBottom: 0,
	},
	row: {
		minHeight: 74,
		paddingHorizontal: 0,
		paddingVertical: 6,
		borderBottomWidth: StyleSheet.hairlineWidth,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
	},
	rowLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		minWidth: 0,
		gap: 10,
	},
	thumb: {
		width: 46,
		height: 46,
		borderRadius: 8,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: StyleSheet.hairlineWidth,
	},
	thumbImage: {
		width: "100%",
		height: "100%",
	},
	nameWrap: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	rowRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		maxWidth: "42%",
	},
});
