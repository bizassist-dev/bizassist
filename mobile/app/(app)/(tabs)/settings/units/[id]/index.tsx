// BizAssist_mobile
// path: app/(app)/(tabs)/settings/units/[id]/index.tsx

import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "react-native-paper";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIConfirmArchiveModal, BAIConfirmRestoreModal } from "@/components/ui/BAIConfirmEntityActionModal";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { useAppBusy } from "@/hooks/useAppBusy";
import { useResponsiveLayout } from "@/lib/layout/useResponsiveLayout";
import { unitsApi } from "@/modules/units/units.api";
import { syncUnitListCaches } from "@/modules/units/units.cache";
import { precisionHint } from "@/modules/units/units.format";
import { SETTINGS_UNITS_ROUTE } from "@/modules/units/units.navigation";
import { unitKeys } from "@/modules/units/units.queries";
import type { Unit } from "@/modules/units/units.types";
import { displayUnitAbbreviation, displayUnitName } from "@/modules/units/units.display";
import { useAppHeader } from "@/modules/navigation/useAppHeader";
import { useAppToast } from "@/providers/AppToastProvider";

// Governance: "Each" is system-owned and cannot be edited or archived.
const PROTECTED_CATALOG_ID = "ea" as const;

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
	const safe = Math.max(0, Math.min(5, Math.trunc(scale || 0)));
	if (safe === 0) return "Whole units (1)";
	return `${safe} decimal${safe === 1 ? "" : "s"} (${precisionHint(safe)})`;
}

export default function UnitDetailScreen() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const theme = useTheme();
	const { contentMaxWidth, isTablet } = useResponsiveLayout();
	const { busy, withBusy } = useAppBusy();
	const { showError, showSuccess } = useAppToast();

	const params = useLocalSearchParams<{ id?: string }>();
	const unitId = String(params.id ?? "");

	const navLockRef = useRef(false);
	const [isNavLocked, setIsNavLocked] = useState(false);
	const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
	const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
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

	const unitsQuery = useQuery<Unit[]>({
		queryKey: unitKeys.list({ includeArchived: true }),
		queryFn: () => unitsApi.listUnits({ includeArchived: true }),
		staleTime: 300_000,
	});

	const unit = useMemo(() => {
		const list = unitsQuery.data ?? [];
		return list.find((u) => u.id === unitId) ?? null;
	}, [unitId, unitsQuery.data]);

	const isProtectedUnit = useMemo(() => !!unit && unit.catalogId === PROTECTED_CATALOG_ID, [unit]);

	const isCustom = !!unit && !unit.catalogId;
	const isArchived = !!unit && !unit.isActive;

	const canEdit = !!unit && isCustom && unit.isActive && !isProtectedUnit;
	const canArchive = !!unit && isCustom && unit.isActive && !isProtectedUnit;
	const canRestore = !!unit && isCustom && isArchived && !isProtectedUnit;

	const readOnlyNote = useMemo(() => {
		if (!unit) return null;
		if (!unit.isActive) return "Archived units are read-only. Restore this unit to make it selectable for new items.";
		if (!isCustom) return "System units are managed by BizAssist. They cannot be edited or archived.";
		return null;
	}, [isCustom, unit]);

	const onEdit = useCallback(() => {
		if (!unit || !canEdit || isUiDisabled) return;
		if (!lockNav()) return;
		router.push(`/(app)/(tabs)/settings/units/${encodeURIComponent(unit.id)}/edit` as any);
	}, [canEdit, isUiDisabled, lockNav, router, unit]);

	// Detail screen => deterministic Back target to avoid duplicate detail pops in history.
	const onBack = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		router.replace(SETTINGS_UNITS_ROUTE as any);
	}, [isUiDisabled, lockNav, router]);

	const onCancel = useCallback(() => {
		onBack();
	}, [onBack]);

	const showInlineCancel = useMemo(() => {
		// Show Cancel only for the Archived state (Restore flow) and only when Edit/Archive are not shown.
		return !!unit && canRestore && !canEdit && !canArchive;
	}, [canArchive, canEdit, canRestore, unit]);

	const onArchivePress = useCallback(() => {
		if (!unit || !canArchive || isUiDisabled) return;
		setIsArchiveConfirmOpen(true);
	}, [canArchive, isUiDisabled, unit]);

	const onRestorePress = useCallback(() => {
		if (!unit || !canRestore || isUiDisabled) return;
		setIsRestoreConfirmOpen(true);
	}, [canRestore, isUiDisabled, unit]);

	const closeArchiveConfirm = useCallback(() => {
		if (isUiDisabled) return;
		setIsArchiveConfirmOpen(false);
	}, [isUiDisabled]);

	const closeRestoreConfirm = useCallback(() => {
		if (isUiDisabled) return;
		setIsRestoreConfirmOpen(false);
	}, [isUiDisabled]);

	const onConfirmArchive = useCallback(async () => {
		if (!unit || !canArchive || isUiDisabled) return;
		await withBusy("Archiving unit...", async () => {
			try {
				const nextUnit = await unitsApi.archiveUnit(unit.id);
				syncUnitListCaches(queryClient, nextUnit);
				void queryClient.invalidateQueries({ queryKey: unitKeys.root });
				setIsArchiveConfirmOpen(false);
				showSuccess("Unit archived.");
			} catch (error: any) {
				showError(error?.message ?? "Failed to archive unit.");
			}
		});
	}, [canArchive, isUiDisabled, queryClient, showError, showSuccess, unit, withBusy]);

	const onConfirmRestore = useCallback(async () => {
		if (!unit || !canRestore || isUiDisabled) return;
		await withBusy("Restoring unit...", async () => {
			try {
				const nextUnit = await unitsApi.restoreUnit(unit.id);
				syncUnitListCaches(queryClient, nextUnit);
				void queryClient.invalidateQueries({ queryKey: unitKeys.root });
				setIsRestoreConfirmOpen(false);
				showSuccess("Unit restored.");
			} catch (error: any) {
				showError(error?.message ?? "Failed to restore unit.");
			}
		});
	}, [canRestore, isUiDisabled, queryClient, showError, showSuccess, unit, withBusy]);

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const detailDividerStyle = useMemo(() => [styles.detailDivider, { backgroundColor: borderColor }], [borderColor]);
	const actionHelperCopy = useMemo(() => {
		if (canRestore && !canEdit && !canArchive) {
			return "Restore makes this unit selectable for new items again.";
		}
		return "Edit updates the unit name or abbreviation. Archive hides it from new items but keeps it for audit.";
	}, [canArchive, canEdit, canRestore]);
	const headerOptions = useAppHeader("detail", { title: "Unit Details", disabled: isUiDisabled, onBack });

	const content = (
		<>
			<BAISurface style={[styles.card, { borderColor }]} padded>
				<BAIText variant='caption' muted>
					Review unit status and configuration.
				</BAIText>

				{unitsQuery.isLoading ? (
					<BAIText variant='caption' muted>
						Loading unit...
					</BAIText>
				) : null}

				{unitsQuery.isError ? (
					<>
						<BAIText variant='caption' muted>
							Could not load unit.
						</BAIText>
						<View style={{ height: 12 }} />
						<BAIRetryButton variant='outline' onPress={() => unitsQuery.refetch()} disabled={isUiDisabled}>
							Retry
						</BAIRetryButton>
					</>
				) : null}

				{!unitsQuery.isLoading && !unitsQuery.isError && !unit ? (
					<>
						<BAIText variant='caption' muted>
							Unit not found.
						</BAIText>
						<View style={{ height: 12 }} />
						<BAIButton variant='outline' onPress={onBack} disabled={isUiDisabled} shape='pill' widthPreset='standard'>
							Back
						</BAIButton>
					</>
				) : null}

				{unit ? (
					<>
						<View style={{ height: 12 }} />
						<View style={detailDividerStyle} />

						<View style={styles.detailRow}>
							<BAIText variant='caption' muted style={styles.detailLabel}>
								Name:
							</BAIText>
							<BAIText variant='subtitle' style={styles.detailValue}>
								{displayUnitName(unit)}
							</BAIText>
						</View>
						<View style={detailDividerStyle} />

						<View style={styles.detailRow}>
							<BAIText variant='caption' muted style={styles.detailLabel}>
								Abbreviation:
							</BAIText>
							<BAIText variant='subtitle' style={styles.detailValue}>
								{displayUnitAbbreviation(unit) || "None"}
							</BAIText>
						</View>
						<View style={detailDividerStyle} />

						<View style={styles.detailRow}>
							<BAIText variant='caption' muted style={styles.detailLabel}>
								Category:
							</BAIText>
							<BAIText variant='subtitle' style={styles.detailValue}>
								{categoryLabel(unit.category)}
							</BAIText>
						</View>
						<View style={detailDividerStyle} />

						<View style={styles.detailRow}>
							<BAIText variant='caption' muted style={styles.detailLabel}>
								Precision:
							</BAIText>
							<BAIText variant='subtitle' style={styles.detailValue}>
								{precisionLabel(unit.precisionScale)}
							</BAIText>
						</View>
						<View style={detailDividerStyle} />

						<View style={styles.detailRow}>
							<BAIText variant='caption' muted style={styles.detailLabel}>
								Status:
							</BAIText>
							<BAIText variant='subtitle' style={styles.detailValue}>
								{unit.isActive ? "Active" : "Archived"}
							</BAIText>
						</View>
						<View style={detailDividerStyle} />

						<View style={styles.detailRow}>
							<BAIText variant='caption' muted style={styles.detailLabel}>
								Origin:
							</BAIText>
							<BAIText variant='subtitle' style={styles.detailValue}>
								{isCustom ? "Custom" : "System"}
							</BAIText>
						</View>
					</>
				) : null}
			</BAISurface>

			{readOnlyNote ? (
				<BAISurface style={[styles.noteCard, { borderColor }]} padded>
					<BAIText variant='caption' muted>
						{readOnlyNote}
					</BAIText>
				</BAISurface>
			) : null}

			{/* Inline actions: Edit + Archive/Restore (per request) */}
			{canEdit || canArchive || canRestore ? (
				<BAISurface style={[styles.actionsCard, { borderColor }]} padded>
					<BAIText variant='caption' muted>
						{actionHelperCopy}
					</BAIText>
					<View style={{ height: 12 }} />

					<View style={styles.actionRow}>
						{canArchive ? (
							<BAIButton
								shape='pill'
								widthPreset='standard'
								variant='outline'
								intent='danger'
								onPress={onArchivePress}
								disabled={isUiDisabled}
								style={styles.actionBtn}
							>
								Archive
							</BAIButton>
						) : null}

						{canEdit ? (
							<BAIButton
								shape='pill'
								widthPreset='standard'
								variant='solid'
								intent='primary'
								onPress={onEdit}
								disabled={isUiDisabled}
								style={styles.actionBtn}
							>
								Edit
							</BAIButton>
						) : null}

						{showInlineCancel ? (
							<BAIButton
								shape='pill'
								widthPreset='standard'
								variant='outline'
								intent='neutral'
								onPress={onCancel}
								disabled={isUiDisabled}
								style={styles.actionBtn}
							>
								Cancel
							</BAIButton>
						) : null}

						{canRestore ? (
							<BAIButton
								shape='pill'
								widthPreset='standard'
								variant='solid'
								intent='primary'
								onPress={onRestorePress}
								disabled={isUiDisabled}
								style={styles.actionBtn}
							>
								Restore
							</BAIButton>
						) : null}
					</View>
				</BAISurface>
			) : null}
		</>
	);

	return (
		<>
			<Stack.Screen options={headerOptions} />
			<BAIScreen
				tabbed
				padded={false}
				safeTop={false}
				scroll
				scrollProps={{ showsVerticalScrollIndicator: false }}
				contentContainerStyle={[styles.contentContainer, isTablet && styles.contentContainerTablet]}
			>
				<View style={[styles.column, isTablet && { maxWidth: contentMaxWidth }]}>{content}</View>
				<BAIConfirmArchiveModal
					visible={isArchiveConfirmOpen}
					entityLabel='unit'
					entityName={unit?.name}
					description='Archived units remain in history but cannot be selected for new items.'
					onDismiss={closeArchiveConfirm}
					onConfirm={onConfirmArchive}
					disabled={isUiDisabled}
				/>
				<BAIConfirmRestoreModal
					visible={isRestoreConfirmOpen}
					entityLabel='unit'
					entityName={unit?.name}
					description='Restored units can be selected for new items again.'
					onDismiss={closeRestoreConfirm}
					onConfirm={onConfirmRestore}
					disabled={isUiDisabled}
				/>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	contentContainer: {
		padding: 12,
		paddingTop: 0,
	},
	contentContainerTablet: {
		alignItems: "center",
	},
	column: {
		width: "100%",
		gap: 12,
	},
	card: {
		borderWidth: 1,
		borderRadius: 24,
	},
	noteCard: {
		borderWidth: 1,
		borderRadius: 18,
	},
	actionsCard: {
		borderWidth: 1,
		borderRadius: 18,
	},
	detailRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 10,
	},
	detailLabel: {
		minWidth: 90,
	},
	detailValue: {
		flexShrink: 1,
	},
	actionRow: {
		flexDirection: "row",
		gap: 12,
	},
	actionBtn: {
		flex: 1,
	},
	detailDivider: {
		height: StyleSheet.hairlineWidth,
		width: "100%",
	},
});
