import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";

import { BAIButton } from "@/components/ui/BAIButton";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIRadioRow } from "@/components/ui/BAIRadioRow";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAISwitchRow } from "@/components/ui/BAISwitchRow";
import { BAIText } from "@/components/ui/BAIText";
import { BAITextInput } from "@/components/ui/BAITextInput";
import { BAIConfirmArchiveModal, BAIConfirmRestoreModal } from "@/components/ui/BAIConfirmEntityActionModal";
import { useAppBusy } from "@/hooks/useAppBusy";
import {
	useArchiveSalesTax,
	useCreateSalesTax,
	useRestoreSalesTax,
	useSalesTaxById,
	useSalesTaxDraft,
	useUpdateSalesTax,
} from "@/modules/taxes/taxes.queries";
import {
	formatPercentageInput,
	parsePercentageInput,
	isPercentageInputValid,
	sanitizePercentageInput,
} from "@/shared/validation/percentageInput";
import { FIELD_LIMITS } from "@/shared/fieldLimits";

function selectionLabel(count: number, emptyLabel: string, singular: string, plural: string) {
	if (count <= 0) return emptyLabel;
	if (count === 1) return `1 ${singular}`;
	return `${count} ${plural}`;
}

function NavRow({ title, value, onPress }: { title: string; value: string; onPress: () => void }) {
	const theme = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.navRow,
				{ borderColor: theme.colors.outlineVariant ?? theme.colors.outline },
				pressed ? styles.navRowPressed : null,
			]}
		>
			<BAIText variant='subtitle'>{title}</BAIText>
			<View style={styles.navRowRight}>
				<BAIText variant='body' style={{ color: theme.colors.onSurfaceVariant ?? theme.colors.onSurface }}>
					{value}
				</BAIText>
				<MaterialCommunityIcons
					name='chevron-right'
					size={24}
					color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
				/>
			</View>
		</Pressable>
	);
}

export default function SalesTaxCreateScreen() {
	const router = useRouter();
	const params = useLocalSearchParams<{ taxId?: string | string[] }>();
	const theme = useTheme();
	const { withBusy } = useAppBusy();
	const createSalesTax = useCreateSalesTax();
	const archiveSalesTax = useArchiveSalesTax();
	const updateSalesTax = useUpdateSalesTax();
	const restoreSalesTax = useRestoreSalesTax();
	const { draft, setDraft, resetDraft } = useSalesTaxDraft();
	const [saveError, setSaveError] = useState<string | null>(null);
	const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
	const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
	const hydratedTaxIdRef = useRef<string | null>(null);

	const taxIdParam = params.taxId;
	const taxId = Array.isArray(taxIdParam) ? (taxIdParam[0] ?? null) : (taxIdParam ?? null);
	const isEditMode = !!taxId;
	const taxQuery = useSalesTaxById(taxId);

	useEffect(() => {
		if (!taxQuery.data || !taxId) return;
		if (hydratedTaxIdRef.current === taxId) return;

		setDraft({
			name: taxQuery.data.name,
			percentageText: String(taxQuery.data.percentage),
			enabled: taxQuery.data.enabled,
			applicationMode: taxQuery.data.applicationMode,
			customAmounts: taxQuery.data.customAmounts,
			itemPricingMode: taxQuery.data.itemPricingMode,
			itemIds: [...taxQuery.data.itemIds],
			serviceIds: [...taxQuery.data.serviceIds],
		});
		hydratedTaxIdRef.current = taxId;
	}, [setDraft, taxId, taxQuery.data]);

	const percentageValid = useMemo(() => isPercentageInputValid(draft.percentageText), [draft.percentageText]);
	const showPercentageError = draft.percentageText.trim().length > 0 && !percentageValid;
	const nameValid = draft.name.trim().length > 0;
	const canSave =
		nameValid &&
		percentageValid &&
		!createSalesTax.isPending &&
		!updateSalesTax.isPending &&
		(!isEditMode || !!taxQuery.data);

	const selectedItemsLabel = selectionLabel(draft.itemIds.length, "No items", "item", "items");
	const selectedServicesLabel = selectionLabel(draft.serviceIds.length, "No services", "service", "services");
	const itemPricingLabel =
		draft.itemPricingMode === "INCLUDE_IN_ITEM_PRICE" ? "Include tax in item price" : "Add tax to item price";
	const percentageDisplay = useMemo(() => {
		const value = draft.percentageText.trim();
		return value ? `${value}%` : "";
	}, [draft.percentageText]);
	const percentageSelection = useMemo(() => {
		const len = draft.percentageText.length;
		return len > 0 ? { start: len, end: len } : undefined;
	}, [draft.percentageText]);
	const percentageValueLimit = FIELD_LIMITS.discountPercent;
	const percentageMaxLength = percentageValueLimit + 1;

	const onBack = useCallback(() => {
		if (router.canGoBack?.()) {
			router.back();
			return;
		}
		router.replace("/(app)/(tabs)/settings/checkout/sales-taxes" as any);
	}, [router]);

	const onSave = useCallback(async () => {
		if (!canSave) return;
		setSaveError(null);
		const normalizedPercentageText = formatPercentageInput(sanitizePercentageInput(draft.percentageText));
		const draftForSave =
			normalizedPercentageText === draft.percentageText
				? draft
				: {
						...draft,
						percentageText: normalizedPercentageText,
					};

		await withBusy("Saving sales tax...", async () => {
			try {
				if (isEditMode && taxId) {
					await updateSalesTax.mutateAsync({ id: taxId, draft: draftForSave });
				} else {
					await createSalesTax.mutateAsync(draftForSave);
					resetDraft();
				}
				router.replace("/(app)/(tabs)/settings/checkout/sales-taxes" as any);
			} catch (error: any) {
				setSaveError(error?.message ?? "Could not save sales tax.");
			}
		});
	}, [canSave, createSalesTax, draft, isEditMode, resetDraft, router, taxId, updateSalesTax, withBusy]);

	const onPercentageChangeText = useCallback(
		(value: string) => {
			const sanitized = sanitizePercentageInput(value);
			const numeric = parsePercentageInput(sanitized, { max: Number.MAX_SAFE_INTEGER });
			if (numeric !== null && numeric > 100) {
				setDraft((current) => ({ ...current, percentageText: "100" }));
				return;
			}
			setDraft((current) => ({
				...current,
				percentageText: sanitized.length > percentageValueLimit ? sanitized.slice(0, percentageValueLimit) : sanitized,
			}));
		},
		[percentageValueLimit, setDraft],
	);

	const onPercentageBlur = useCallback(() => {
		setDraft((current) => {
			const sanitized = sanitizePercentageInput(current.percentageText);
			const normalized = formatPercentageInput(sanitized);
			if (normalized === current.percentageText) return current;
			return { ...current, percentageText: normalized };
		});
	}, [setDraft]);

	const onArchive = useCallback(() => {
		if (!taxId) return;
		setIsArchiveConfirmOpen(true);
	}, [taxId]);

	const onRestore = useCallback(() => {
		if (!taxId) return;
		setIsRestoreConfirmOpen(true);
	}, [taxId]);

	const closeArchiveConfirm = useCallback(() => {
		setIsArchiveConfirmOpen(false);
	}, []);

	const closeRestoreConfirm = useCallback(() => {
		setIsRestoreConfirmOpen(false);
	}, []);

	const onConfirmArchive = useCallback(async () => {
		if (!taxId) return;
		setSaveError(null);
		await withBusy("Archiving sales tax...", async () => {
			try {
				await archiveSalesTax.mutateAsync(taxId);
				setIsArchiveConfirmOpen(false);
				router.replace("/(app)/(tabs)/settings/checkout/sales-taxes" as any);
			} catch (error: any) {
				setSaveError(error?.message ?? "Could not archive sales tax.");
			}
		});
	}, [archiveSalesTax, router, taxId, withBusy]);

	const onConfirmRestore = useCallback(async () => {
		if (!taxId) return;
		setSaveError(null);
		await withBusy("Restoring sales tax...", async () => {
			try {
				await restoreSalesTax.mutateAsync(taxId);
				setIsRestoreConfirmOpen(false);
				router.replace("/(app)/(tabs)/settings/checkout/sales-taxes" as any);
			} catch (error: any) {
				setSaveError(error?.message ?? "Could not restore sales tax.");
			}
		});
	}, [restoreSalesTax, router, taxId, withBusy]);

	const isArchived = !!taxQuery.data?.archivedAt;

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<BAIScreen tabbed padded={false} safeTop={false}>
				<BAIHeader
					title={isEditMode ? "Edit tax" : "Create tax"}
					variant='back'
					onLeftPress={onBack}
					onRightPress={onSave}
					rightDisabled={!canSave}
					rightSlot={({ disabled }) => (
						<View
							style={[
								styles.headerActionPill,
								{ backgroundColor: disabled ? theme.colors.surfaceDisabled : theme.colors.primary },
							]}
						>
							<BAIText
								variant='body'
								style={[
									styles.headerActionText,
									{ color: disabled ? theme.colors.onSurfaceDisabled : theme.colors.onPrimary },
								]}
							>
								Save
							</BAIText>
						</View>
					)}
				/>

				<View style={styles.screen}>
					<BAISurface bordered padded style={styles.mainCard}>
						<ScrollView
							style={styles.mainCardScroll}
							contentContainerStyle={styles.mainCardScrollContent}
							showsVerticalScrollIndicator={false}
							keyboardShouldPersistTaps='handled'
						>
							{isEditMode && taxQuery.isLoading ? (
								<BAIText variant='body' style={{ color: theme.colors.onSurfaceVariant ?? theme.colors.onSurface }}>
									Loading tax...
								</BAIText>
							) : null}

							{isEditMode && taxQuery.isError ? (
								<BAIText variant='caption' style={{ color: theme.colors.error }}>
									Could not load this tax.
								</BAIText>
							) : null}

							<View style={styles.primarySection}>
								<BAISwitchRow
									label='Enabled'
									value={draft.enabled}
									onValueChange={(value) => setDraft((current) => ({ ...current, enabled: value }))}
									switchVariant='blue'
								/>

								<BAITextInput
									label='Name'
									value={draft.name}
									onChangeText={(value) => setDraft((current) => ({ ...current, name: value }))}
									maxLength={120}
									placeholder='Sales Tax'
								/>

								<BAITextInput
									label='Percentage'
									value={percentageDisplay}
									onChangeText={onPercentageChangeText}
									onBlur={onPercentageBlur}
									selection={percentageSelection}
									keyboardType='decimal-pad'
									maxLength={percentageMaxLength}
									placeholder='0%'
								/>

								{showPercentageError ? (
									<BAIText variant='caption' style={{ color: theme.colors.error }}>
										Enter a value between 0 and 100.
									</BAIText>
								) : null}
							</View>

							<View style={styles.taxApplicationSection}>
								<BAIText variant='subtitle'>Tax application</BAIText>
								<BAIText variant='body' style={{ color: theme.colors.onSurfaceVariant ?? theme.colors.onSurface }}>
									Apply tax to
								</BAIText>

								<BAIRadioRow
									title='All taxable items and services'
									description='Includes all future items and services.'
									selected={draft.applicationMode === "ALL_TAXABLE"}
									onPress={() => setDraft((current) => ({ ...current, applicationMode: "ALL_TAXABLE" }))}
								/>

								<BAIRadioRow
									title='Select items'
									selected={draft.applicationMode === "SELECT_ITEMS"}
									onPress={() => setDraft((current) => ({ ...current, applicationMode: "SELECT_ITEMS" }))}
								/>

								{draft.applicationMode === "SELECT_ITEMS" ? (
									<>
										<NavRow
											title='Items'
											value={selectedItemsLabel}
											onPress={() => router.push("/(app)/(tabs)/settings/checkout/sales-taxes/items" as any)}
										/>
										<NavRow
											title='Services'
											value={selectedServicesLabel}
											onPress={() => router.push("/(app)/(tabs)/settings/checkout/sales-taxes/services" as any)}
										/>
									</>
								) : null}

								<BAISwitchRow
									label='Custom amounts'
									value={draft.customAmounts}
									onValueChange={(value) => setDraft((current) => ({ ...current, customAmounts: value }))}
									switchVariant='blue'
								/>

								<NavRow
									title='Item pricing'
									value={itemPricingLabel}
									onPress={() => router.push("/(app)/(tabs)/settings/checkout/sales-taxes/item-pricing" as any)}
								/>
							</View>

							{isEditMode && taxId ? (
								isArchived ? (
									<BAIButton
										variant='soft'
										intent='neutral'
										onPress={onRestore}
										shape='default'
										style={styles.actionButton}
									>
										Restore tax
									</BAIButton>
								) : (
									<BAIButton
										variant='outline'
										intent='danger'
										onPress={onArchive}
										shape='default'
										style={styles.actionButton}
									>
										Archive tax
									</BAIButton>
								)
							) : null}

							{saveError ? (
								<BAIText variant='caption' style={{ color: theme.colors.error }}>
									{saveError}
								</BAIText>
							) : null}
						</ScrollView>
					</BAISurface>
				</View>
				<BAIConfirmArchiveModal
					visible={isArchiveConfirmOpen}
					entityLabel='sales tax'
					entityName={taxQuery.data?.name}
					description='Archived taxes remain in your records and are removed from active checkout calculations.'
					onDismiss={closeArchiveConfirm}
					onConfirm={onConfirmArchive}
					disabled={archiveSalesTax.isPending}
				/>
				<BAIConfirmRestoreModal
					visible={isRestoreConfirmOpen}
					entityLabel='sales tax'
					entityName={taxQuery.data?.name}
					description='Restored taxes return to active checkout calculations.'
					onDismiss={closeRestoreConfirm}
					onConfirm={onConfirmRestore}
					disabled={restoreSalesTax.isPending}
				/>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		paddingHorizontal: 10,
		paddingVertical: 6,
		paddingTop: 0,
		gap: 6,
	},
	mainCard: {
		flex: 1,
		borderRadius: 16,
		marginBottom: 0,
		padding: 10,
	},
	mainCardScroll: {
		flex: 1,
	},
	mainCardScrollContent: {
		gap: 6,
		paddingBottom: 8,
	},
	primarySection: {
		gap: 6,
	},
	taxApplicationSection: {
		gap: 6,
	},
	navRow: {
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 8,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	navRowPressed: {
		opacity: 0.85,
	},
	navRowRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	headerActionPill: {
		width: 90,
		height: 40,
		paddingHorizontal: 16,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	headerActionText: {
		fontSize: 16,
		fontWeight: "600",
	},
	actionButton: {
		minHeight: 40,
	},
});
