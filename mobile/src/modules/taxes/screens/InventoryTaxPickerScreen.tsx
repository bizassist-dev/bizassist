import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { useTheme } from "react-native-paper";

import { BAIButton } from "@/components/ui/BAIButton";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { useInventoryHeader } from "@/modules/inventory/useInventoryHeader";
import { useProcessExitGuard } from "@/modules/navigation/useProcessExitGuard";
import type { InventoryRouteScope } from "@/modules/inventory/navigation.scope";
import { useSalesTaxesList } from "@/modules/taxes/taxes.queries";
import {
	DRAFT_ID_KEY,
	buildTaxSelectionParams,
	parseTaxSelectionParams,
	type TaxPickerInboundParams,
} from "@/modules/taxes/taxPicker.contract";

const SETTINGS_TAXES_ROUTE = "/(app)/(tabs)/settings/checkout/sales-taxes" as const;

export default function InventoryTaxPickerScreen({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const theme = useTheme();
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;

	const params = useLocalSearchParams<TaxPickerInboundParams>();
	const parsedSelection = useMemo(() => parseTaxSelectionParams(params as any), [params]);
	const returnTo = parsedSelection.returnTo;
	const draftId = useMemo(
		() => parsedSelection.draftId || String(params[DRAFT_ID_KEY] ?? "").trim(),
		[params, parsedSelection.draftId],
	);

	const [isTaxExempt, setIsTaxExempt] = useState<boolean>(() => parsedSelection.taxExempt);

	const navLockRef = useRef(false);
	const lockNav = useCallback((ms = 650) => {
		if (navLockRef.current) return false;
		navLockRef.current = true;
		setTimeout(() => (navLockRef.current = false), ms);
		return true;
	}, []);

	const taxesQuery = useSalesTaxesList({ includeArchived: false });
	const autoAssignedTaxes = useMemo(
		() => (taxesQuery.data?.items ?? []).filter((item) => !item.archivedAt && item.enabled),
		[taxesQuery.data?.items],
	);

	const onCommitAndBack = useCallback(() => {
		if (!lockNav()) return;
		const selectedTaxIds = isTaxExempt ? [] : autoAssignedTaxes.map((tax) => tax.id);
		const selectedTaxNames = isTaxExempt ? [] : autoAssignedTaxes.map((tax) => tax.name);
		if (returnTo) {
			router.replace({
				pathname: returnTo as any,
				params: buildTaxSelectionParams({
					selectedTaxIds,
					selectedTaxNames,
					selectionSource: selectedTaxIds.length > 0 ? "existing" : "cleared",
					taxExempt: isTaxExempt,
					draftId: draftId || undefined,
				}),
			});
			return;
		}
		router.back();
	}, [autoAssignedTaxes, draftId, isTaxExempt, lockNav, returnTo, router]);
	const guardedOnBack = useProcessExitGuard(onCommitAndBack);

	const onOpenManageTaxes = useCallback(() => {
		if (!lockNav()) return;
		router.push(SETTINGS_TAXES_ROUTE as any);
	}, [lockNav, router]);

	const headerOptions = useInventoryHeader("picker", {
		title: "Taxes",
		headerBackTitle: routeScope === "settings-items-services" ? "Create Service" : "Create Item",
		onBack: guardedOnBack,
	});

	return (
		<>
			<Stack.Screen options={headerOptions} />

			<BAIScreen tabbed padded={false} safeTop={false} safeBottom={false}>
				<View style={[styles.screen, { backgroundColor: theme.colors.background, paddingBottom: 8 }]}>
					<BAISurface style={[styles.card, { borderColor }]} padded={false}>
						<View style={styles.taxModeRow}>
							<View style={styles.taxModeCopy}>
								<BAIText variant='subtitle'>Set this item as nontaxable</BAIText>
								<BAIText variant='body' muted style={styles.taxModeBody}>
									This item will be exempt from any current or future taxes across checkout.
								</BAIText>
							</View>
							<Switch value={isTaxExempt} onValueChange={setIsTaxExempt} />
						</View>

						{!isTaxExempt ? (
							<View style={styles.autoAssignedWrap}>
								<BAIText variant='title'>Automatically assigned sales tax</BAIText>
								<BAIText variant='body' style={styles.autoAssignedBody}>
									The following taxes will be automatically applied.
								</BAIText>
								<Pressable onPress={onOpenManageTaxes}>
									<BAIText variant='subtitle' style={styles.linkText}>
										Edit tax rules
									</BAIText>
								</Pressable>

								{taxesQuery.isLoading ? (
									<BAIText variant='body' muted>
										Loading taxes...
									</BAIText>
								) : taxesQuery.isError ? (
									<View style={styles.centerState}>
										<BAIText variant='body'>Could not load taxes.</BAIText>
										<BAIRetryButton variant='outline' mode='outlined' shape='pill' onPress={() => taxesQuery.refetch()}>
											Retry
										</BAIRetryButton>
									</View>
								) : autoAssignedTaxes.length === 0 ? (
									<View style={styles.centerState}>
										<BAIText variant='body' muted>
											No automatic taxes are configured.
										</BAIText>
										<BAIButton variant='solid' onPress={onOpenManageTaxes} shape='pill'>
											Manage Taxes
										</BAIButton>
									</View>
								) : (
									<View style={styles.rowsWrap}>
										{autoAssignedTaxes.map((tax) => (
											<View key={tax.id} style={[styles.taxRow, { borderColor }]}>
												<BAIText variant='subtitle' numberOfLines={1} style={styles.taxName}>
													{tax.name}
												</BAIText>
												<BAIText variant='subtitle'>{tax.percentage}%</BAIText>
											</View>
										))}
									</View>
								)}
							</View>
						) : null}

						<View style={styles.footerActions}>
							<BAIButton mode='contained' onPress={onCommitAndBack} shape='pill'>
								Done
							</BAIButton>
						</View>
					</BAISurface>
				</View>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		paddingHorizontal: 12,
		paddingTop: 8,
	},
	card: {
		flex: 1,
		borderWidth: 1,
		borderRadius: 18,
		paddingHorizontal: 14,
		paddingVertical: 14,
		gap: 16,
	},
	taxModeRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	taxModeCopy: {
		flex: 1,
		minWidth: 0,
		gap: 6,
	},
	taxModeBody: {
		lineHeight: 24,
	},
	autoAssignedWrap: {
		gap: 10,
	},
	autoAssignedBody: {
		lineHeight: 24,
	},
	linkText: {
		textDecorationLine: "underline",
	},
	centerState: {
		alignItems: "flex-start",
		justifyContent: "center",
		gap: 10,
	},
	rowsWrap: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	taxRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	taxName: {
		flex: 1,
		minWidth: 0,
	},
	footerActions: {
		marginTop: "auto",
	},
});
