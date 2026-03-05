// BizAssist_mobile
// path: src/modules/inventory/services/ServiceUpsertScreen.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Keyboard, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesome6 } from "@expo/vector-icons";

import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { ConfirmActionModal } from "@/components/settings/ConfirmActionModal";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAICTAPillButton } from "@/components/ui/BAICTAButton";
import { BAIInlineHeaderScaffold } from "@/components/ui/BAIInlineHeaderScaffold";
import { BAIIconButton } from "@/components/ui/BAIIconButton";
import { BAIMinorMoneyInput } from "@/components/ui/BAIMinorMoneyInput";
import { BAIPressableRow } from "@/components/ui/BAIPressableRow";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAISwitchRow } from "@/components/ui/BAISwitchRow";
import { BAIText } from "@/components/ui/BAIText";
import { BAITextInput } from "@/components/ui/BAITextInput";
import { BAITextarea } from "@/components/ui/BAITextarea";

import { useAppBusy } from "@/hooks/useAppBusy";
import { useAppToast } from "@/providers/AppToastProvider";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { useProcessExitGuard } from "@/modules/navigation/useProcessExitGuard";
import {
	CATEGORY_PICKER_ROUTE,
	CATEGORY_SELECTED_ID_KEY,
	CATEGORY_SELECTED_NAME_KEY,
	CATEGORY_SELECTION_SOURCE_KEY,
	DRAFT_ID_KEY as CATEGORY_DRAFT_ID_KEY,
	RETURN_TO_KEY as CATEGORY_RETURN_TO_KEY,
	parseCategorySelectionParams,
} from "@/modules/categories/categoryPicker.contract";
import { useProductCreateDraft } from "@/modules/inventory/drafts/useProductCreateDraft";
import { useServiceCreateDraft } from "@/modules/inventory/drafts/useServiceCreateDraft";
import { PosTileTextOverlay } from "@/modules/inventory/components/PosTileTextOverlay";
import {
	DEFAULT_SERVICE_SEGMENT_DURATION_MINUTES,
	DEFAULT_SERVICE_TOTAL_DURATION_MINUTES,
	type ServiceCreateDraft,
} from "@/modules/inventory/drafts/serviceCreateDraft";
import { inventoryApi } from "@/modules/inventory/inventory.api";
import { mapInventoryRouteToScope, type InventoryRouteScope } from "@/modules/inventory/navigation.scope";
import { inventoryKeys } from "@/modules/inventory/inventory.queries";
import { runGovernedExitReplace } from "@/modules/inventory/navigation.governance";
import {
	DRAFT_ID_KEY as POS_TILE_DRAFT_ID_KEY,
	POS_TILE_ROUTE,
	ROOT_RETURN_TO_KEY as POS_TILE_ROOT_RETURN_TO_KEY,
} from "@/modules/inventory/posTile.contract";
import {
	DRAFT_ID_KEY as DURATION_DRAFT_ID_KEY,
	DURATION_MINUTES_KEY,
	DURATION_TARGET_KEY,
	parseDurationSelectionParams,
} from "@/modules/inventory/services/durationPicker.contract";
import { DurationWheelAccordion } from "@/modules/inventory/services/components/DurationWheelAccordion";
import { clampDurationMinutes, SERVICE_DURATION_MAX_MINUTES } from "@/modules/inventory/services/serviceDuration";
import { uploadProductImage } from "@/modules/media/media.upload";
import { toMediaDomainError } from "@/modules/media/media.errors";
import {
	buildModifierSelectionParams,
	MODIFIER_PICKER_ROUTE,
	MODIFIER_SELECTED_IDS_KEY,
	MODIFIER_SELECTION_SOURCE_KEY,
	parseModifierSelectionParams,
	RETURN_TO_KEY as MODIFIER_RETURN_TO_KEY,
} from "@/modules/modifiers/modifierPicker.contract";
import { unitsApi } from "@/modules/units/units.api";
import { unitKeys } from "@/modules/units/units.queries";
import type { Unit } from "@/modules/units/units.types";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import {
	sanitizeDescriptionDraftInput,
	sanitizeDescriptionInput,
	sanitizeLabelInput,
	sanitizeMoneyInput,
	sanitizeProductNameDraftInput,
	sanitizeProductNameInput,
} from "@/shared/validation/sanitize";

const DEFAULT_SERVICE_TILE_COLOR = "#616161";

type ServiceUpsertMode = "create" | "edit";
type SaveTarget = "detail" | "addAnother";
type DurationAccordionKey = "total" | "initial" | "processing" | "final";

type ServiceDraft = ServiceCreateDraft;

function toMoneyOrNull(raw: string): number | null {
	const sanitized = sanitizeServicePriceInput(String(raw ?? ""));
	const value = sanitized.trim();
	if (!value) return null;

	const n = Number(value);
	if (!Number.isFinite(n)) return null;
	if (n < 0) return null;
	return n;
}

function isHexColor(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

function normalizeDurationOrNull(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	const n = Math.trunc(value);
	if (n < 0 || n > SERVICE_DURATION_MAX_MINUTES) return null;
	return n;
}

function pickDefaultServiceUnit(units: Unit[]): Unit | null {
	const activeTime = units.filter((unit) => unit.isActive && unit.category === "TIME");
	if (!activeTime.length) return null;

	const preferredHour = activeTime.find((unit) => {
		const name = unit.name.trim().toLowerCase();
		const abbr = unit.abbreviation.trim().toLowerCase();
		const catalogId = (unit.catalogId ?? "").trim().toLowerCase();
		return name === "hour" || abbr === "hr" || abbr === "h" || catalogId === "hr" || catalogId === "hour";
	});
	return preferredHour ?? activeTime[0] ?? null;
}

function capText(raw: string, maxLen: number): string {
	if (maxLen <= 0) return "";
	return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
}

function hasValue(v: unknown): boolean {
	if (typeof v === "string") return v.trim().length > 0;
	if (typeof v === "number") return Number.isFinite(v);
	if (typeof v === "boolean") return v;
	return v != null;
}

function sanitizeServiceNameInput(raw: string): string {
	return capText(sanitizeProductNameInput(raw), FIELD_LIMITS.productName);
}

function sanitizeServiceNameDraftInput(raw: string): string {
	return capText(sanitizeProductNameDraftInput(raw), FIELD_LIMITS.productName);
}

function buildFallbackPosLabel(name: string): string {
	const compact = sanitizeLabelInput(name).replace(/\s+/g, "");
	return compact.slice(0, 2).toUpperCase();
}

function sanitizeServicePriceInput(raw: string): string {
	return sanitizeMoneyInput(raw);
}

function sanitizeServiceDescriptionDraft(raw: string): string {
	return capText(sanitizeDescriptionDraftInput(raw), FIELD_LIMITS.productDescription);
}

function sanitizeServiceDescriptionFinal(raw: string): string {
	return capText(sanitizeDescriptionInput(raw), FIELD_LIMITS.productDescription);
}

function buildDefaultProcessingSegments(totalMinutes: number) {
	const total = Math.max(0, Math.trunc(totalMinutes));
	const base = Math.floor(total / 3);
	const remainder = total - base * 3;
	return {
		initial: base,
		processing: base,
		final: base + remainder,
	};
}

function evaluateServiceDraftValidity(draft: ServiceDraft) {
	const nameOk = sanitizeServiceNameInput(draft.name).trim().length > 0;
	const price = toMoneyOrNull(draft.priceText);
	const priceOk = price !== null;
	const totalOk = draft.durationTotalMinutes > 0 && draft.durationTotalMinutes <= SERVICE_DURATION_MAX_MINUTES;

	if (!draft.processingEnabled) {
		return {
			nameOk,
			priceOk,
			totalOk,
			segmentsOk: true,
			sumOk: true,
			isValid: nameOk && priceOk && totalOk,
		};
	}

	const initial = normalizeDurationOrNull(draft.durationInitialMinutes);
	const processing = normalizeDurationOrNull(draft.durationProcessingMinutes);
	const final = normalizeDurationOrNull(draft.durationFinalMinutes);
	const segmentsOk = initial !== null && processing !== null && final !== null;
	const processingTotal = segmentsOk ? initial + processing + final : 0;
	const processingTotalOk = processingTotal > 0 && processingTotal <= SERVICE_DURATION_MAX_MINUTES;

	return {
		nameOk,
		priceOk,
		totalOk: processingTotalOk,
		segmentsOk,
		sumOk: true,
		isValid: nameOk && priceOk && processingTotalOk && segmentsOk,
	};
}

type ServiceEditBreadcrumbEvent =
	| {
			name: "service_edit_missing_id";
			routeScope: InventoryRouteScope;
	  }
	| {
			name: "service_edit_detail_load_failed";
			routeScope: InventoryRouteScope;
			serviceId: string;
			code?: string;
			status?: number;
	  }
	| {
			name: "service_edit_hydrate_blocked_non_service";
			routeScope: InventoryRouteScope;
			serviceId: string;
			detailType: string;
	  }
	| {
			name: "service_edit_hydrate_succeeded";
			routeScope: InventoryRouteScope;
			serviceId: string;
	  };

function trackServiceEditBreadcrumb(evt: ServiceEditBreadcrumbEvent) {
	const debug = __DEV__ && process.env.EXPO_PUBLIC_SERVICE_EDIT_DEBUG === "true";
	if (evt.name === "service_edit_hydrate_succeeded" && !debug) return;

	const payload: Record<string, unknown> = {
		routeScope: evt.routeScope,
	};
	if ((evt as any).serviceId) payload.serviceId = (evt as any).serviceId;
	if ((evt as any).code) payload.code = (evt as any).code;
	if ((evt as any).status !== undefined) payload.status = (evt as any).status;
	if ((evt as any).detailType) payload.detailType = (evt as any).detailType;

	if (evt.name === "service_edit_hydrate_succeeded") {
		console.log(`[services.edit] ${evt.name}`, payload);
		return;
	}

	console.warn(`[services.edit] ${evt.name}`, payload);
}

export function ServiceUpsertScreen(props: {
	mode: ServiceUpsertMode;
	headerTitle: string;
	thisRoute: string;
	exitRoute: string;
	serviceId?: string;
	routeScope?: InventoryRouteScope;
}) {
	const { mode, headerTitle, thisRoute, exitRoute, serviceId, routeScope = "inventory" } = props;
	const router = useRouter();
	const theme = useTheme();
	const params = useLocalSearchParams();
	const resolvedServiceId = useMemo(() => {
		const fromProp = String(serviceId ?? "").trim();
		if (fromProp) return fromProp;
		const fromRoute = (params as any)?.id;
		if (Array.isArray(fromRoute)) return String(fromRoute[0] ?? "").trim();
		return String(fromRoute ?? "").trim();
	}, [params, serviceId]);
	const tabBarHeight = useBottomTabBarHeight();
	const { currencyCode } = useActiveBusinessMeta();
	const appBusy = useAppBusy();
	const { showSuccess } = useAppToast();
	const queryClient = useQueryClient();

	const [draftId] = useState(() => {
		const fromCategory = String((params as any)?.[CATEGORY_DRAFT_ID_KEY] ?? "").trim();
		if (fromCategory) return fromCategory;
		const fromTile = String((params as any)?.[POS_TILE_DRAFT_ID_KEY] ?? "").trim();
		if (fromTile) return fromTile;
		const fromDuration = String((params as any)?.[DURATION_DRAFT_ID_KEY] ?? "").trim();
		if (fromDuration) return fromDuration;
		if (mode === "edit" && resolvedServiceId) return `svc_edit_${resolvedServiceId}`;
		return `svc_${Date.now()}`;
	});
	const routeDraftIdParam = useMemo(() => {
		const fromCategory = String((params as any)?.[CATEGORY_DRAFT_ID_KEY] ?? "").trim();
		if (fromCategory) return fromCategory;
		const fromTile = String((params as any)?.[POS_TILE_DRAFT_ID_KEY] ?? "").trim();
		if (fromTile) return fromTile;
		const fromDuration = String((params as any)?.[DURATION_DRAFT_ID_KEY] ?? "").trim();
		return fromDuration;
	}, [params]);
	const hasRouteDraftIdParam = routeDraftIdParam.length > 0;

	useEffect(() => {
		if (routeDraftIdParam) return;
		(router as any).setParams?.({
			[CATEGORY_DRAFT_ID_KEY]: draftId,
		});
	}, [draftId, routeDraftIdParam, router]);

	const { draft: mediaDraft, patch: patchMediaDraft, reset: resetMediaDraft } = useProductCreateDraft(draftId);
	const { draft, patch: setDraft, reset: resetServiceDraft } = useServiceCreateDraft(draftId);
	const [error, setError] = useState<string | null>(null);
	const [initializedEdit, setInitializedEdit] = useState(mode === "create");
	const [openDurationAccordion, setOpenDurationAccordion] = useState<DurationAccordionKey | null>(null);
	const [confirmExitOpen, setConfirmExitOpen] = useState(false);
	const missingIdLoggedRef = useRef(false);
	const loadErrorLoggedRef = useRef<string | null>(null);

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

	const isUiDisabled = appBusy.busy.isBusy || isNavLocked;
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);

	const detailQuery = useQuery({
		queryKey: inventoryKeys.productDetail(resolvedServiceId),
		queryFn: () => inventoryApi.getProductDetail(resolvedServiceId),
		enabled: mode === "edit" && !!resolvedServiceId,
		staleTime: 30_000,
	});

	useEffect(() => {
		if (mode !== "edit") return;
		if (!resolvedServiceId) {
			if (missingIdLoggedRef.current) return;
			trackServiceEditBreadcrumb({
				name: "service_edit_missing_id",
				routeScope,
			});
			missingIdLoggedRef.current = true;
			return;
		}
		missingIdLoggedRef.current = false;
	}, [mode, resolvedServiceId, routeScope]);

	useEffect(() => {
		if (mode !== "edit") return;
		if (!resolvedServiceId) return;
		if (!detailQuery.isError) {
			loadErrorLoggedRef.current = null;
			return;
		}

		const err = detailQuery.error as any;
		const status = typeof err?.response?.status === "number" ? err.response.status : undefined;
		const codeCandidate = err?.response?.data?.code ?? err?.response?.data?.error?.code ?? err?.code ?? undefined;
		const code = typeof codeCandidate === "string" ? codeCandidate : undefined;
		const fingerprint = `${resolvedServiceId}:${String(code ?? "")}::${String(status ?? "")}`;
		if (loadErrorLoggedRef.current === fingerprint) return;

		trackServiceEditBreadcrumb({
			name: "service_edit_detail_load_failed",
			routeScope,
			serviceId: resolvedServiceId,
			code,
			status,
		});
		loadErrorLoggedRef.current = fingerprint;
	}, [detailQuery.error, detailQuery.isError, mode, resolvedServiceId, routeScope]);

	const unitsQuery = useQuery<Unit[]>({
		queryKey: unitKeys.list({ includeArchived: false }),
		queryFn: () => unitsApi.listUnits({ includeArchived: false }),
		staleTime: 30_000,
	});

	const defaultServiceUnit = useMemo(() => pickDefaultServiceUnit(unitsQuery.data ?? []), [unitsQuery.data]);
	const isServiceDraftPristine = useMemo(() => {
		if (hasValue(draft.name)) return false;
		if (hasValue(draft.categoryId) || hasValue(draft.categoryName)) return false;
		if (hasValue(draft.priceText)) return false;
		if (hasValue(draft.description)) return false;
		if (hasValue(draft.unitId)) return false;
		if (draft.processingEnabled) return false;
		if (draft.durationTotalMinutes !== DEFAULT_SERVICE_TOTAL_DURATION_MINUTES) return false;
		const initial = normalizeDurationOrNull(draft.durationInitialMinutes);
		const processing = normalizeDurationOrNull(draft.durationProcessingMinutes);
		const final = normalizeDurationOrNull(draft.durationFinalMinutes);
		if (initial !== DEFAULT_SERVICE_SEGMENT_DURATION_MINUTES) return false;
		if (processing !== DEFAULT_SERVICE_SEGMENT_DURATION_MINUTES) return false;
		if (final !== DEFAULT_SERVICE_SEGMENT_DURATION_MINUTES) return false;
		return true;
	}, [
		draft.categoryId,
		draft.categoryName,
		draft.description,
		draft.durationFinalMinutes,
		draft.durationInitialMinutes,
		draft.durationProcessingMinutes,
		draft.durationTotalMinutes,
		draft.name,
		draft.priceText,
		draft.processingEnabled,
		draft.unitId,
	]);
	const mediaDraftTileLabelTouched = Boolean(mediaDraft.posTileLabelTouched);
	const isMediaDraftPristine = useMemo(() => {
		const draftImage = String(mediaDraft.imageLocalUri ?? "").trim();
		const draftLabel = String(mediaDraft.posTileLabel ?? "").trim();
		const draftMode = mediaDraft.posTileMode === "IMAGE" ? "IMAGE" : "COLOR";
		const draftColor = typeof mediaDraft.posTileColor === "string" ? mediaDraft.posTileColor.trim() : "";
		return !draftImage && !draftLabel && !mediaDraftTileLabelTouched && draftMode === "COLOR" && !draftColor;
	}, [
		mediaDraft.imageLocalUri,
		mediaDraft.posTileColor,
		mediaDraft.posTileLabel,
		mediaDraft.posTileMode,
		mediaDraftTileLabelTouched,
	]);

	useEffect(() => {
		if (!defaultServiceUnit) return;
		setDraft((prev) => (prev.unitId ? prev : { ...prev, unitId: defaultServiceUnit.id }));
	}, [defaultServiceUnit, setDraft]);

	const categorySelection = useMemo(() => parseCategorySelectionParams(params as any), [params]);
	const modifierSelection = useMemo(() => parseModifierSelectionParams(params as any), [params]);
	useEffect(() => {
		if (!categorySelection.hasSelectionKey) return;
		setDraft((prev) => ({
			...prev,
			categoryId: categorySelection.selectedCategoryId,
			categoryName: categorySelection.selectedCategoryName,
		}));

		(router as any).setParams?.({
			[CATEGORY_SELECTED_ID_KEY]: undefined,
			[CATEGORY_SELECTED_NAME_KEY]: undefined,
			[CATEGORY_SELECTION_SOURCE_KEY]: undefined,
		});
	}, [categorySelection, router, setDraft]);

	useEffect(() => {
		if (!modifierSelection.hasSelectionKey) return;
		setDraft((prev) => ({
			...prev,
			modifierGroupIds: modifierSelection.selectedModifierGroupIds,
		}));

		(router as any).setParams?.({
			[MODIFIER_SELECTED_IDS_KEY]: undefined,
			[MODIFIER_SELECTION_SOURCE_KEY]: undefined,
		});
	}, [modifierSelection, router, setDraft]);

	const durationSelection = useMemo(() => parseDurationSelectionParams(params as any), [params]);
	useEffect(() => {
		if (!durationSelection.hasSelectionKey) return;
		if (!durationSelection.target || durationSelection.minutes == null) return;
		const minutes = clampDurationMinutes(durationSelection.minutes);

		setDraft((prev) => {
			if (durationSelection.target === "total") {
				return { ...prev, durationTotalMinutes: minutes };
			}
			if (durationSelection.target === "initial") {
				return { ...prev, durationInitialMinutes: minutes };
			}
			if (durationSelection.target === "processing") {
				return { ...prev, durationProcessingMinutes: minutes };
			}
			return { ...prev, durationFinalMinutes: minutes };
		});

		(router as any).setParams?.({
			[DURATION_TARGET_KEY]: undefined,
			[DURATION_MINUTES_KEY]: undefined,
		});
	}, [durationSelection, router, setDraft]);

	useEffect(() => {
		if (mode !== "edit") return;
		if (initializedEdit) return;
		if (!detailQuery.data) return;

		const detail = detailQuery.data as any;
		const detailType = String(detail?.type ?? "")
			.trim()
			.toUpperCase();
		if (detailType && detailType !== "SERVICE") {
			trackServiceEditBreadcrumb({
				name: "service_edit_hydrate_blocked_non_service",
				routeScope,
				serviceId: resolvedServiceId,
				detailType,
			});
			setError("This screen is only for services.");
			setInitializedEdit(true);
			return;
		}

		const persistedTotal =
			normalizeDurationOrNull(detail.durationTotalMinutes) ?? DEFAULT_SERVICE_TOTAL_DURATION_MINUTES;
		const persistedProcessing = Boolean(detail.processingEnabled);
		const initial = normalizeDurationOrNull(detail.durationInitialMinutes);
		const processing = normalizeDurationOrNull(detail.durationProcessingMinutes);
		const final = normalizeDurationOrNull(detail.durationFinalMinutes);
		const fallbackSegments = buildDefaultProcessingSegments(persistedTotal);
		const resolvedInitial = persistedProcessing ? (initial ?? fallbackSegments.initial) : null;
		const resolvedProcessing = persistedProcessing ? (processing ?? fallbackSegments.processing) : null;
		const resolvedFinal = persistedProcessing ? (final ?? fallbackSegments.final) : null;
		const resolvedTotal =
			persistedProcessing && resolvedInitial != null && resolvedProcessing != null && resolvedFinal != null
				? resolvedInitial + resolvedProcessing + resolvedFinal
				: persistedTotal;
		const resolvedCategoryName =
			typeof detail.category?.name === "string"
				? detail.category.name.trim()
				: typeof detail.categoryName === "string"
					? detail.categoryName.trim()
					: "";
		const resolvedUnitId =
			typeof detail.unitId === "string" && detail.unitId.trim()
				? detail.unitId.trim()
				: typeof detail.unit?.id === "string" && detail.unit.id.trim()
					? detail.unit.id.trim()
					: (defaultServiceUnit?.id ?? "");
		const resolvedModifierGroupIds = Array.isArray(detail.modifierGroupIds)
			? detail.modifierGroupIds.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
			: [];
		const remotePrimaryImageUrl = String(detail.primaryImageUrl ?? "").trim();
		const resolvedPosTileMode =
			detail.posTileMode === "IMAGE" || (!!remotePrimaryImageUrl && detail.posTileMode !== "COLOR") ? "IMAGE" : "COLOR";
		const resolvedPosTileLabel =
			typeof detail.posTileLabel === "string"
				? detail.posTileLabel
				: typeof detail.tileLabel === "string"
					? detail.tileLabel
					: typeof detail.posTileName === "string"
						? detail.posTileName
						: "";

		const shouldSeedServiceFromDetail = !hasRouteDraftIdParam || isServiceDraftPristine;
		if (shouldSeedServiceFromDetail) {
			setDraft({
				name: sanitizeServiceNameInput(String(detail.name ?? "")),
				categoryId: String(detail.categoryId ?? "").trim(),
				categoryName: resolvedCategoryName,
				modifierGroupIds: resolvedModifierGroupIds,
				priceText: detail.price != null ? sanitizeServicePriceInput(String(detail.price)) : "",
				description: sanitizeServiceDescriptionFinal(String(detail.description ?? "")),
				unitId: resolvedUnitId,
				durationTotalMinutes: resolvedTotal,
				processingEnabled: persistedProcessing,
				durationInitialMinutes: resolvedInitial,
				durationProcessingMinutes: resolvedProcessing,
				durationFinalMinutes: resolvedFinal,
			});
		}

		const shouldSeedMediaFromDetail = !hasRouteDraftIdParam || isMediaDraftPristine;
		if (shouldSeedMediaFromDetail) {
			patchMediaDraft({
				posTileMode: resolvedPosTileMode,
				posTileColor: isHexColor(detail.posTileColor) ? detail.posTileColor : DEFAULT_SERVICE_TILE_COLOR,
				posTileLabel: resolvedPosTileLabel,
				posTileLabelTouched: false,
				imageLocalUri: "",
			});
		}

		if (resolvedServiceId) {
			trackServiceEditBreadcrumb({
				name: "service_edit_hydrate_succeeded",
				routeScope,
				serviceId: resolvedServiceId,
			});
		}

		setInitializedEdit(true);
	}, [
		draft,
		defaultServiceUnit?.id,
		detailQuery.data,
		hasRouteDraftIdParam,
		initializedEdit,
		isMediaDraftPristine,
		isServiceDraftPristine,
		mode,
		patchMediaDraft,
		routeScope,
		resolvedServiceId,
		setDraft,
	]);

	const remoteImageUri = useMemo(() => {
		if (mode !== "edit") return "";
		const detail = detailQuery.data as any;
		return String(detail?.primaryImageUrl ?? "").trim();
	}, [detailQuery.data, mode]);

	const localImageUri = useMemo(() => String(mediaDraft.imageLocalUri ?? "").trim(), [mediaDraft.imageLocalUri]);
	const tileMode = mediaDraft.posTileMode === "IMAGE" ? "IMAGE" : "COLOR";
	const selectedTileColor = isHexColor(mediaDraft.posTileColor) ? mediaDraft.posTileColor : null;
	const tileColor = selectedTileColor ?? DEFAULT_SERVICE_TILE_COLOR;
	const previewImageUri = localImageUri || (tileMode === "IMAGE" ? remoteImageUri : "");
	const previewHasImage = tileMode === "IMAGE" && !!previewImageUri;
	const tileLabel = useMemo(() => sanitizeLabelInput(mediaDraft.posTileLabel ?? "").trim(), [mediaDraft.posTileLabel]);
	const serviceName = useMemo(() => sanitizeServiceNameInput(draft.name).trim(), [draft.name]);
	const displayTileLabel = useMemo(() => tileLabel || buildFallbackPosLabel(serviceName), [serviceName, tileLabel]);
	const hasTileLabel = displayTileLabel.length > 0;
	const hasServiceName = serviceName.length > 0;
	const hasColor = tileMode === "COLOR" && !!selectedTileColor;
	const hasVisualTile = previewHasImage || hasColor;
	const shouldShowEmpty = !hasVisualTile;
	const shouldShowTileTextOverlay = hasTileLabel || hasServiceName;
	const tileLabelColor = "#FFFFFF";

	const validation = useMemo(() => evaluateServiceDraftValidity(draft), [draft]);
	const hasDirtyInput = useMemo(() => {
		if (mode !== "create") return false;
		if (hasValue(draft.name)) return true;
		if (hasValue(draft.categoryId) || hasValue(draft.categoryName)) return true;
		if ((draft.modifierGroupIds?.length ?? 0) > 0) return true;
		if (hasValue(draft.priceText)) return true;
		if (hasValue(draft.description)) return true;
		if (hasValue(draft.unitId)) return true;
		if (draft.processingEnabled) return true;
		if (draft.durationTotalMinutes !== DEFAULT_SERVICE_TOTAL_DURATION_MINUTES) return true;
		if (hasValue(mediaDraft.imageLocalUri)) return true;
		if (hasValue(mediaDraft.posTileLabel)) return true;
		if (mediaDraft.posTileMode === "IMAGE") return true;
		if (isHexColor(mediaDraft.posTileColor) && mediaDraft.posTileColor !== DEFAULT_SERVICE_TILE_COLOR) return true;
		return false;
	}, [draft, mediaDraft, mode]);

	const onExit = useCallback(() => {
		if (mode === "create" && hasDirtyInput) {
			setConfirmExitOpen(true);
			return;
		}
		runGovernedExitReplace(exitRoute, {
			router: router as any,
			lockNav,
			disabled: isUiDisabled,
		});
	}, [exitRoute, hasDirtyInput, isUiDisabled, lockNav, mode, router]);
	const guardedOnExit = useProcessExitGuard(onExit);

	const onDiscardExit = useCallback(() => {
		if (isUiDisabled) return;
		setConfirmExitOpen(false);
		const exited = runGovernedExitReplace(exitRoute, {
			router: router as any,
			lockNav,
			disabled: isUiDisabled,
		});
		if (!exited) return;
		resetServiceDraft({ unitId: defaultServiceUnit?.id ?? "" });
		setOpenDurationAccordion(null);
		resetMediaDraft();
	}, [defaultServiceUnit?.id, exitRoute, isUiDisabled, lockNav, resetMediaDraft, resetServiceDraft, router]);

	const onResumeEditing = useCallback(() => {
		if (isUiDisabled) return;
		setConfirmExitOpen(false);
	}, [isUiDisabled]);

	const openCategoryPicker = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		router.replace({
			pathname: toScopedRoute(CATEGORY_PICKER_ROUTE) as any,
			params: {
				[CATEGORY_RETURN_TO_KEY]: thisRoute,
				[CATEGORY_DRAFT_ID_KEY]: draftId,
				[CATEGORY_SELECTED_ID_KEY]: draft.categoryId || "",
				[CATEGORY_SELECTED_NAME_KEY]: draft.categoryName || "",
				[CATEGORY_SELECTION_SOURCE_KEY]: "existing",
			} as any,
		});
	}, [draft.categoryId, draft.categoryName, draftId, isUiDisabled, lockNav, router, thisRoute, toScopedRoute]);

	const openModifierPicker = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		router.replace({
			pathname: MODIFIER_PICKER_ROUTE as any,
			params: {
				[MODIFIER_RETURN_TO_KEY]: thisRoute,
				...buildModifierSelectionParams({
					selectedModifierGroupIds: draft.modifierGroupIds,
					selectionSource: (draft.modifierGroupIds?.length ?? 0) > 0 ? "existing" : "cleared",
					draftId,
				}),
			} as any,
		});
	}, [draft.modifierGroupIds, draftId, isUiDisabled, lockNav, router, thisRoute]);

	const openTileEditor = useCallback(() => {
		if (isUiDisabled) return;
		if (!lockNav()) return;
		router.push({
			pathname: toScopedRoute(POS_TILE_ROUTE) as any,
			params: {
				[POS_TILE_DRAFT_ID_KEY]: draftId,
				[POS_TILE_ROOT_RETURN_TO_KEY]: thisRoute,
			} as any,
		});
	}, [draftId, isUiDisabled, lockNav, router, thisRoute, toScopedRoute]);

	const onToggleProcessing = useCallback(
		(enabled: boolean) => {
			setDraft((prev) => {
				if (!enabled) {
					return { ...prev, processingEnabled: false };
				}

				if (
					prev.durationInitialMinutes != null &&
					prev.durationProcessingMinutes != null &&
					prev.durationFinalMinutes != null
				) {
					const nextTotal = prev.durationInitialMinutes + prev.durationProcessingMinutes + prev.durationFinalMinutes;
					return { ...prev, processingEnabled: true, durationTotalMinutes: nextTotal };
				}

				const defaults = buildDefaultProcessingSegments(prev.durationTotalMinutes);
				return {
					...prev,
					processingEnabled: true,
					durationInitialMinutes: defaults.initial,
					durationProcessingMinutes: defaults.processing,
					durationFinalMinutes: defaults.final,
					durationTotalMinutes: defaults.initial + defaults.processing + defaults.final,
				};
			});
		},
		[setDraft],
	);

	const onDurationAccordionExpandedChange = useCallback((key: DurationAccordionKey, next: boolean) => {
		setOpenDurationAccordion((prev) => {
			if (next) return key;
			return prev === key ? null : prev;
		});
	}, []);

	useEffect(() => {
		if (draft.processingEnabled && openDurationAccordion === "total") {
			setOpenDurationAccordion(null);
		}
		if (!draft.processingEnabled && openDurationAccordion && openDurationAccordion !== "total") {
			setOpenDurationAccordion(null);
		}
	}, [draft.processingEnabled, openDurationAccordion]);

	const onSave = useCallback(
		async (saveTarget: SaveTarget = "detail") => {
			if (isUiDisabled || !validation.isValid) return;
			const safeName = sanitizeServiceNameInput(draft.name).trim();
			const safePrice = toMoneyOrNull(draft.priceText);
			if (!safeName || safePrice == null) return;
			setError(null);
			const safeInitial = normalizeDurationOrNull(draft.durationInitialMinutes);
			const safeProcessing = normalizeDurationOrNull(draft.durationProcessingMinutes);
			const safeFinal = normalizeDurationOrNull(draft.durationFinalMinutes);
			const effectiveTotalMinutes =
				draft.processingEnabled && safeInitial != null && safeProcessing != null && safeFinal != null
					? safeInitial + safeProcessing + safeFinal
					: Math.trunc(draft.durationTotalMinutes);
			const payloadDurationInitial = draft.processingEnabled ? draft.durationInitialMinutes : effectiveTotalMinutes;
			const payloadDurationProcessing = draft.processingEnabled ? draft.durationProcessingMinutes : 0;
			const payloadDurationFinal = draft.processingEnabled ? draft.durationFinalMinutes : 0;

			await appBusy.withBusy("Saving Service…", async () => {
				const payload = {
					type: "SERVICE" as const,
					name: safeName,
					categoryId: draft.categoryId.trim() || undefined,
					modifierGroupIds: draft.modifierGroupIds,
					description: sanitizeServiceDescriptionFinal(draft.description).trim() || undefined,
					price: safePrice,
					trackInventory: false,
					unitId: draft.unitId.trim() || undefined,
					durationTotalMinutes: effectiveTotalMinutes,
					processingEnabled: draft.processingEnabled,
					durationInitialMinutes: payloadDurationInitial,
					durationProcessingMinutes: payloadDurationProcessing,
					durationFinalMinutes: payloadDurationFinal,
					posTileMode: tileMode,
					posTileColor: tileColor,
					posTileLabel: (mediaDraft.posTileLabel ?? "").trim() || undefined,
				};

				try {
					let id = resolvedServiceId;
					if (mode === "create") {
						const created = await inventoryApi.createProduct(payload as any);
						id = String((created as any)?.id ?? "").trim();
					} else {
						if (!id) throw new Error("Missing service id.");
						await inventoryApi.updateProduct(id, payload as any);
					}

					if (id && tileMode === "IMAGE" && localImageUri) {
						try {
							await uploadProductImage({
								imageKind: "PRIMARY_POS_TILE",
								localUri: localImageUri,
								productId: id,
								isPrimary: true,
								sortOrder: 0,
							});
						} catch (uploadErr) {
							const domainErr = toMediaDomainError(uploadErr);
							setError(domainErr.message || "Service saved, but the tile image failed to upload.");
							return;
						}
					}

					queryClient.invalidateQueries({ queryKey: inventoryKeys.productsRoot() as any });
					if (id) {
						queryClient.invalidateQueries({ queryKey: inventoryKeys.productDetail(id) as any });
					}

					if (mode === "create" && saveTarget === "addAnother") {
						resetServiceDraft({
							unitId: defaultServiceUnit?.id ?? "",
							modifierGroupIds: [],
						});
						setOpenDurationAccordion(null);
						resetMediaDraft();
						showSuccess("Service saved. Add another service.");
						return;
					}

					if (mode === "create") {
						resetServiceDraft();
						setOpenDurationAccordion(null);
						resetMediaDraft();
					}

					if (id) {
						router.replace(toScopedRoute(`/(app)/(tabs)/inventory/services/${encodeURIComponent(id)}`) as any);
						return;
					}

					router.replace(exitRoute as any);
				} catch (saveErr: any) {
					const payloadErr = saveErr?.response?.data;
					const backendCode =
						payloadErr?.code ?? payloadErr?.errorCode ?? payloadErr?.error?.code ?? payloadErr?.data?.code;
					if (backendCode === "CATALOG_LIMIT_REACHED") {
						setError("Limit Reached\nThis business has reached the supported catalog limit. Contact support.");
						return;
					}
					const backendMessage =
						payloadErr?.message ??
						payloadErr?.error ??
						payloadErr?.errorMessage ??
						payloadErr?.error?.message ??
						payloadErr?.data?.message;
					setError(String(backendMessage ?? saveErr?.message ?? "Failed to save service."));
				}
			});
		},
		[
			appBusy,
			draft,
			defaultServiceUnit?.id,
			exitRoute,
			isUiDisabled,
			localImageUri,
			mediaDraft.posTileLabel,
			mode,
			queryClient,
			resetServiceDraft,
			resetMediaDraft,
			router,
			resolvedServiceId,
			showSuccess,
			tileColor,
			tileMode,
			toScopedRoute,
			validation.isValid,
		],
	);
	const onSaveDetail = useCallback(() => onSave("detail"), [onSave]);
	const onSaveAndAddAnother = useCallback(() => onSave("addAnother"), [onSave]);

	const screenBottomPad = tabBarHeight + 12;
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const dismissKeyboardOnBackgroundPress = useCallback(() => {
		if (mode !== "create") return;
		Keyboard.dismiss();
	}, [mode]);

	const hasMissingEditId = mode === "edit" && !resolvedServiceId;
	const detailLoadError = mode === "edit" && (detailQuery.isError || hasMissingEditId);
	const shouldShowLoading = mode === "edit" && !hasMissingEditId && !initializedEdit && detailQuery.isLoading;

	if (shouldShowLoading) {
		return (
			<BAIInlineHeaderScaffold title={headerTitle} variant='exit' onLeftPress={guardedOnExit} disabled={isUiDisabled}>
				<BAIScreen safeTop={false} padded={false} style={styles.root}>
					<View style={styles.loadingScreen}>
						<BAIActivityIndicator />
					</View>
				</BAIScreen>
			</BAIInlineHeaderScaffold>
		);
	}

	return (
		<>
			<BAIInlineHeaderScaffold title={headerTitle} variant='exit' onLeftPress={guardedOnExit} disabled={isUiDisabled}>
				<BAIScreen padded={false} safeTop={false} safeBottom={false} style={styles.root}>
					<TouchableWithoutFeedback onPress={dismissKeyboardOnBackgroundPress} accessible={false}>
						<View
							style={[
								styles.screen,
								styles.scroll,
								{ backgroundColor: theme.colors.background, paddingBottom: screenBottomPad },
							]}
						>
							<BAISurface style={[styles.card, { borderColor }]} padded={false}>
								<ScrollView
									style={styles.formScroll}
									contentContainerStyle={styles.formContainer}
									showsVerticalScrollIndicator={false}
									showsHorizontalScrollIndicator={false}
									keyboardShouldPersistTaps='handled'
								>
									{detailLoadError ? (
										<BAIText variant='caption' style={{ color: theme.colors.error }}>
											{hasMissingEditId
												? "Missing service id. Reopen Edit Service from Service Details."
												: "Could not load service details. You can retry by reopening this screen."}
										</BAIText>
									) : null}

									<View style={styles.imageSection}>
										<View style={styles.imageInlineRow}>
											<View
												style={[
													styles.imagePreview,
													{
														borderColor,
														backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
													},
												]}
											>
												{previewHasImage ? (
													<Image
														source={{ uri: previewImageUri }}
														style={styles.imagePreviewImage}
														resizeMode='cover'
													/>
												) : hasColor ? (
													<View style={[styles.imagePreviewImage, { backgroundColor: tileColor }]} />
												) : shouldShowEmpty ? (
													<View style={styles.imagePreviewEmpty}>
														<FontAwesome6
															name='image'
															size={64}
															color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
														/>
														<BAIText variant='caption' muted>
															No Photo
														</BAIText>
													</View>
												) : null}
												{shouldShowTileTextOverlay ? (
													<PosTileTextOverlay label={displayTileLabel} name={serviceName} textColor={tileLabelColor} />
												) : null}
											</View>

											<View style={styles.imageActionColumn}>
												<BAIIconButton
													variant='outlined'
													size='md'
													icon='camera'
													iconSize={34}
													accessibilityLabel='Edit image'
													onPress={openTileEditor}
													disabled={isUiDisabled}
													style={styles.imageEditButtonOutside}
												/>
											</View>
										</View>
									</View>

									<BAITextInput
										label='Name'
										value={draft.name}
										onChangeText={(text) =>
											setDraft((prev) => ({ ...prev, name: sanitizeServiceNameDraftInput(text) }))
										}
										onBlur={() =>
											setDraft((prev) => ({
												...prev,
												name: sanitizeServiceNameInput(prev.name),
											}))
										}
										style={styles.formTextInput}
										maxLength={FIELD_LIMITS.productName}
										placeholder='e.g. Haircut'
										autoCapitalize='words'
										disabled={isUiDisabled}
									/>

									<BAITextarea
										label='Description (optional)'
										value={draft.description}
										onChangeText={(text) =>
											setDraft((prev) => ({ ...prev, description: sanitizeServiceDescriptionDraft(text) }))
										}
										onBlur={() =>
											setDraft((prev) => ({
												...prev,
												description: sanitizeServiceDescriptionFinal(prev.description),
											}))
										}
										maxLength={FIELD_LIMITS.productDescription}
										placeholder='Optional description…'
										disabled={isUiDisabled}
									/>

									<BAIPressableRow
										label='Category'
										value={draft.categoryName || "None"}
										onPress={openCategoryPicker}
										disabled={isUiDisabled}
									/>

									{routeScope === "inventory" ? (
										<BAIPressableRow
											label='Modifiers'
											value={
												(draft.modifierGroupIds?.length ?? 0) > 0 ? `${draft.modifierGroupIds.length} selected` : "None"
											}
											onPress={openModifierPicker}
											disabled={isUiDisabled}
										/>
									) : null}

									<BAIMinorMoneyInput
										label='Price'
										value={draft.priceText}
										onChangeText={(text) =>
											setDraft((prev) => ({ ...prev, priceText: sanitizeServicePriceInput(text) }))
										}
										style={[styles.formTextInput, styles.moneyHalfInput]}
										contentStyle={styles.moneyValueInputContent}
										currencyCode={currencyCode}
										maxMinorDigits={11}
										disabled={isUiDisabled}
									/>

									<DurationWheelAccordion
										valueMinutes={draft.durationTotalMinutes}
										onChangeMinutes={(nextMinutes) =>
											setDraft((prev) => ({
												...prev,
												durationTotalMinutes: clampDurationMinutes(nextMinutes),
											}))
										}
										disabled={isUiDisabled || draft.processingEnabled}
										expanded={openDurationAccordion === "total"}
										onExpandedChange={(next) => onDurationAccordionExpandedChange("total", next)}
									/>

									<BAISwitchRow
										label='Add Processing Time'
										value={draft.processingEnabled}
										onValueChange={onToggleProcessing}
										disabled={isUiDisabled}
									/>

									{draft.processingEnabled ? (
										<>
											<DurationWheelAccordion
												label='Initial Duration'
												valueMinutes={draft.durationInitialMinutes ?? DEFAULT_SERVICE_SEGMENT_DURATION_MINUTES}
												onChangeMinutes={(nextMinutes) =>
													setDraft((prev) => ({
														...prev,
														durationInitialMinutes: clampDurationMinutes(nextMinutes),
														durationTotalMinutes:
															clampDurationMinutes(nextMinutes) +
															(normalizeDurationOrNull(prev.durationProcessingMinutes) ?? 0) +
															(normalizeDurationOrNull(prev.durationFinalMinutes) ?? 0),
													}))
												}
												disabled={isUiDisabled}
												expanded={openDurationAccordion === "initial"}
												onExpandedChange={(next) => onDurationAccordionExpandedChange("initial", next)}
											/>

											<DurationWheelAccordion
												label='Processing Duration'
												valueMinutes={draft.durationProcessingMinutes ?? DEFAULT_SERVICE_SEGMENT_DURATION_MINUTES}
												onChangeMinutes={(nextMinutes) =>
													setDraft((prev) => ({
														...prev,
														durationProcessingMinutes: clampDurationMinutes(nextMinutes),
														durationTotalMinutes:
															(normalizeDurationOrNull(prev.durationInitialMinutes) ?? 0) +
															clampDurationMinutes(nextMinutes) +
															(normalizeDurationOrNull(prev.durationFinalMinutes) ?? 0),
													}))
												}
												disabled={isUiDisabled}
												expanded={openDurationAccordion === "processing"}
												onExpandedChange={(next) => onDurationAccordionExpandedChange("processing", next)}
											/>

											<DurationWheelAccordion
												label='Final Duration'
												valueMinutes={draft.durationFinalMinutes ?? DEFAULT_SERVICE_SEGMENT_DURATION_MINUTES}
												onChangeMinutes={(nextMinutes) =>
													setDraft((prev) => ({
														...prev,
														durationFinalMinutes: clampDurationMinutes(nextMinutes),
														durationTotalMinutes:
															(normalizeDurationOrNull(prev.durationInitialMinutes) ?? 0) +
															(normalizeDurationOrNull(prev.durationProcessingMinutes) ?? 0) +
															clampDurationMinutes(nextMinutes),
													}))
												}
												disabled={isUiDisabled}
												expanded={openDurationAccordion === "final"}
												onExpandedChange={(next) => onDurationAccordionExpandedChange("final", next)}
											/>
										</>
									) : null}

									{error ? (
										<BAIText variant='caption' style={{ color: theme.colors.error }}>
											{error}
										</BAIText>
									) : null}

									<View style={styles.actions}>
										<BAICTAPillButton
											variant='outline'
											intent='neutral'
											onPress={guardedOnExit}
											disabled={isUiDisabled}
											style={styles.actionButton}
										>
											Cancel
										</BAICTAPillButton>
										<BAICTAPillButton
											onPress={onSaveDetail}
											disabled={isUiDisabled || !validation.isValid}
											style={styles.actionButton}
										>
											Save
										</BAICTAPillButton>
									</View>
									{mode === "create" ? (
										<BAIButton
											variant='solid'
											onPress={onSaveAndAddAnother}
											disabled={isUiDisabled || !validation.isValid}
											style={styles.saveAnotherButton}
											intent='primary'
										>
											Save & Add Another
										</BAIButton>
									) : null}
								</ScrollView>
							</BAISurface>
						</View>
					</TouchableWithoutFeedback>
				</BAIScreen>
			</BAIInlineHeaderScaffold>

			<ConfirmActionModal
				visible={confirmExitOpen}
				title='Unsaved changes'
				message='Do you want to resume editing or discard this service?'
				confirmLabel='Resume'
				cancelLabel='Discard'
				confirmIntent='primary'
				cancelIntent='error'
				onDismiss={onResumeEditing}
				onConfirm={onResumeEditing}
				onCancel={onDiscardExit}
				disabled={isUiDisabled}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center" },
	screen: { paddingHorizontal: 12, paddingBottom: 0 },
	scroll: { flex: 1 },
	card: {
		flex: 1,
		minHeight: 0,
		borderWidth: 1,
		borderRadius: 24,
		gap: 6,
		paddingHorizontal: 0,
		paddingTop: 12,
		paddingBottom: 12,
	},
	formScroll: {
		flex: 1,
	},
	formContainer: {
		paddingHorizontal: 14,
		paddingBottom: 250,
		gap: 12,
	},
	formTextInput: {
		marginBottom: 0,
	},
	moneyHalfInput: {
		width: "50%",
		alignSelf: "flex-start",
	},
	moneyValueInputContent: {
		paddingLeft: 16,
		paddingRight: 20,
	},
	imageSection: {
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		marginBottom: 0,
		marginTop: 0,
	},
	imagePreview: {
		width: 180,
		aspectRatio: 1,
		borderRadius: 18,
		borderWidth: 1,
		overflow: "hidden",
	},
	imagePreviewImage: {
		width: "100%",
		height: "100%",
	},
	imagePreviewEmpty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	tileLabelWrap: {
		position: "absolute",
		left: 2,
		right: 2,
		bottom: 2,
		borderRadius: 16,
		overflow: "hidden",
		minHeight: 80,
	},
	tileLabelOverlay: {
		...StyleSheet.absoluteFillObject,
	},
	tileLabelContent: {
		paddingHorizontal: 10,
		paddingTop: 6,
		paddingBottom: 6,
		justifyContent: "flex-start",
		gap: 2,
	},
	tileNameOnlyContent: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		minHeight: 32,
		paddingHorizontal: 10,
		paddingVertical: 6,
		justifyContent: "center",
	},
	tileLabelRow: {
		minHeight: 36,
		justifyContent: "flex-end",
	},
	tileNameRow: {
		minHeight: 20,
		justifyContent: "flex-start",
	},
	tileNamePill: {
		alignSelf: "stretch",
		width: "100%",
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	tileLabelText: {
		fontWeight: "700",
		fontSize: 30,
	},
	tileItemName: {
		marginTop: 0,
		fontSize: 18,
	},
	imageInlineRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 16,
	},
	imageActionColumn: {
		alignItems: "center",
		gap: 20,
	},
	imageEditButtonOutside: {
		width: 60,
		height: 60,
		borderRadius: 30,
	},
	actions: {
		flexDirection: "row",
		gap: 12,
		marginTop: 12,
	},
	saveAnotherButton: {
		marginTop: 12,
	},
	actionButton: { flex: 1 },
});
