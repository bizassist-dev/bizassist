import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Animated,
	Easing,
	Keyboard,
	PanResponder,
	Pressable,
	StyleSheet,
	View,
	useWindowDimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DraggableFlatList from "react-native-draggable-flatlist";

import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIHeaderActionButton } from "@/components/ui/BAIHeaderActionButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAITextInput } from "@/components/ui/BAITextInput";
import { useAppBusy } from "@/hooks/useAppBusy";
import { useProductCreateDraft } from "@/modules/inventory/drafts/useProductCreateDraft";
import { mapInventoryRouteToScope, type InventoryRouteScope } from "@/modules/inventory/navigation.scope";
import { optionsApi } from "@/modules/options/options.api";
import { optionKeys } from "@/modules/options/options.queries";
import {
	DRAFT_ID_KEY,
	OPTION_SET_ID_KEY,
	PRODUCT_ID_KEY,
	PRODUCT_OPTION_VALUES_ROUTE,
	PRODUCT_SELECT_OPTIONS_ROUTE,
	ROOT_RETURN_TO_KEY,
	RETURN_TO_KEY,
	normalizeReturnTo,
} from "@/modules/options/productOptionPicker.contract";
import { useAppToast } from "@/providers/AppToastProvider";
import { FIELD_LIMITS } from "@/shared/fieldLimits";
import { toTitleCase } from "@/shared/text/titleCase";
import { sanitizeLabelInput } from "@/shared/validation/sanitize";

function clampText(value: string, maxLength: number): string {
	if (maxLength <= 0) return "";
	return String(value ?? "").slice(0, maxLength);
}

const DELETE_ACTION_WIDTH = 88;
const DELETE_ACTION_GAP = 2;
const DELETE_REVEAL_INSET = DELETE_ACTION_WIDTH + DELETE_ACTION_GAP;
const DELETE_OPEN_DURATION_MS = 280;
const DELETE_CLOSE_DURATION_MS = 180;

export function ProductCreateOptionScreen({ routeScope = "inventory" }: { routeScope?: InventoryRouteScope }) {
	const router = useRouter();
	const params = useLocalSearchParams();
	const theme = useTheme();
	const queryClient = useQueryClient();
	const { height: windowHeight } = useWindowDimensions();
	const { withBusy, busy } = useAppBusy();
	const { showError, showSuccess } = useAppToast();

	const draftId = String(params[DRAFT_ID_KEY] ?? "").trim();
	const productId = String(params[PRODUCT_ID_KEY] ?? "").trim();
	const { draft, patch } = useProductCreateDraft(draftId || undefined);
	const toScopedRoute = useCallback((route: string) => mapInventoryRouteToScope(route, routeScope), [routeScope]);
	const returnTo = useMemo(
		() => normalizeReturnTo(params[RETURN_TO_KEY]) ?? toScopedRoute("/(app)/(tabs)/inventory/products/options/select"),
		[params, toScopedRoute],
	);
	const rootReturnTo = useMemo(
		() => normalizeReturnTo(params[ROOT_RETURN_TO_KEY]) ?? toScopedRoute("/(app)/(tabs)/inventory/products/create"),
		[params, toScopedRoute],
	);

	const [optionSetName, setOptionSetName] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [isDisplayNameLinked, setIsDisplayNameLinked] = useState(true);
	const [optionDraft, setOptionDraft] = useState("");
	const [optionValues, setOptionValues] = useState<string[]>([]);
	const [isDragActive, setIsDragActive] = useState(false);
	const [deleteRevealValue, setDeleteRevealValue] = useState<string | null>(null);
	const displayNameInputRef = useRef<any>(null);
	const addOptionInputRef = useRef<any>(null);
	const deleteAnimationTokenRef = useRef(0);
	const deleteActionTranslateX = useRef(new Animated.Value(DELETE_ACTION_WIDTH)).current;
	const deleteActionOpacity = useRef(new Animated.Value(0)).current;
	const deleteIconRotation = useRef(new Animated.Value(0)).current;
	const optionMainInsetRight = useRef(new Animated.Value(0)).current;

	const isDisabled = busy.isBusy;
	const scrollSpacerHeight = Math.round(windowHeight * 0.5);
	const normalizedSetName = toTitleCase(sanitizeLabelInput(optionSetName)).trim();
	const normalizedDisplayName = toTitleCase(sanitizeLabelInput(displayName)).trim();
	const canCreate =
		normalizedSetName.length > 0 && normalizedDisplayName.length > 0 && optionValues.length > 0 && !isDisabled;

	useEffect(() => {
		if (!deleteRevealValue) return;
		if (optionValues.includes(deleteRevealValue)) return;
		deleteActionTranslateX.setValue(DELETE_ACTION_WIDTH);
		deleteActionOpacity.setValue(0);
		deleteIconRotation.setValue(0);
		optionMainInsetRight.setValue(0);
		setDeleteRevealValue(null);
	}, [
		deleteActionOpacity,
		deleteActionTranslateX,
		deleteIconRotation,
		deleteRevealValue,
		optionMainInsetRight,
		optionValues,
	]);

	const resetDeleteRevealAnimationValues = useCallback(() => {
		deleteActionTranslateX.setValue(DELETE_ACTION_WIDTH);
		deleteActionOpacity.setValue(0);
		deleteIconRotation.setValue(0);
		optionMainInsetRight.setValue(0);
	}, [deleteActionOpacity, deleteActionTranslateX, deleteIconRotation, optionMainInsetRight]);

	const runDeleteActionAnimation = useCallback(
		(open: boolean, onComplete?: () => void) => {
			const token = deleteAnimationTokenRef.current + 1;
			deleteAnimationTokenRef.current = token;
			const duration = open ? DELETE_OPEN_DURATION_MS : DELETE_CLOSE_DURATION_MS;

			Animated.parallel([
				Animated.timing(optionMainInsetRight, {
					toValue: open ? DELETE_REVEAL_INSET : 0,
					duration,
					easing: Easing.out(Easing.cubic),
					useNativeDriver: false,
				}),
				Animated.timing(deleteActionTranslateX, {
					toValue: open ? 0 : DELETE_ACTION_WIDTH,
					duration,
					easing: Easing.out(Easing.cubic),
					useNativeDriver: true,
				}),
				Animated.timing(deleteActionOpacity, {
					toValue: open ? 1 : 0,
					duration,
					easing: Easing.out(Easing.cubic),
					useNativeDriver: true,
				}),
				Animated.timing(deleteIconRotation, {
					toValue: open ? 1 : 0,
					duration,
					easing: Easing.out(Easing.cubic),
					useNativeDriver: true,
				}),
			]).start(() => {
				if (deleteAnimationTokenRef.current !== token) return;
				onComplete?.();
			});
		},
		[deleteActionOpacity, deleteActionTranslateX, deleteIconRotation, optionMainInsetRight],
	);

	const closeDeleteReveal = useCallback(
		(onClosed?: () => void) => {
			if (!deleteRevealValue) {
				onClosed?.();
				return;
			}
			runDeleteActionAnimation(false, () => {
				resetDeleteRevealAnimationValues();
				setDeleteRevealValue(null);
				onClosed?.();
			});
		},
		[deleteRevealValue, resetDeleteRevealAnimationValues, runDeleteActionAnimation],
	);

	const toggleDeleteReveal = useCallback(
		(value: string) => {
			void Haptics.selectionAsync();
			if (deleteRevealValue === value) {
				closeDeleteReveal();
				return;
			}

			if (deleteRevealValue) {
				closeDeleteReveal(() => {
					setDeleteRevealValue(value);
					requestAnimationFrame(() => runDeleteActionAnimation(true));
				});
				return;
			}

			resetDeleteRevealAnimationValues();
			setDeleteRevealValue(value);
			requestAnimationFrame(() => runDeleteActionAnimation(true));
		},
		[closeDeleteReveal, deleteRevealValue, resetDeleteRevealAnimationValues, runDeleteActionAnimation],
	);

	const deleteIconRotate = useMemo(
		() =>
			deleteIconRotation.interpolate({
				inputRange: [0, 1],
				outputRange: ["0deg", "90deg"],
			}),
		[deleteIconRotation],
	);

	const addOptionValue = useCallback(() => {
		if (isDisabled) return;
		const normalized = toTitleCase(sanitizeLabelInput(clampText(optionDraft, FIELD_LIMITS.modifierName))).trim();
		if (!normalized) return;
		setOptionValues((prev) =>
			prev.some((item) => item.toLowerCase() === normalized.toLowerCase()) ? prev : [...prev, normalized],
		);
		setOptionDraft("");
	}, [isDisabled, optionDraft]);

	const onBack = useCallback(() => {
		router.replace({
			pathname: returnTo as any,
			params: {
				[DRAFT_ID_KEY]: draft.draftId,
				[RETURN_TO_KEY]: rootReturnTo,
				[ROOT_RETURN_TO_KEY]: rootReturnTo,
				...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
			} as any,
		});
	}, [draft.draftId, productId, returnTo, rootReturnTo, router]);

	const onCreate = useCallback(async () => {
		if (!canCreate) return;

		await withBusy("Creating option...", async () => {
			try {
				const created = await optionsApi.createOptionSet({
					name: normalizedSetName,
					displayName: normalizedDisplayName,
				});

				for (let idx = 0; idx < optionValues.length; idx += 1) {
					await optionsApi.addOptionValue(created.id, {
						name: optionValues[idx],
						sortOrder: idx,
					});
				}

				const existing = draft.optionSelections.filter((row) => row.optionSetId !== created.id);
				existing.push({
					optionSetId: created.id,
					optionSetName: normalizedDisplayName || created.displayName || created.name,
					selectedValueIds: [],
					selectedValueNames: [],
					sortOrder: existing.length,
				});
				const nextSelectedOptionSetIds = draft.selectedOptionSetIds.includes(created.id)
					? draft.selectedOptionSetIds
					: [...draft.selectedOptionSetIds, created.id];

				patch({
					selectedOptionSetIds: nextSelectedOptionSetIds,
					selectedVariationKeys: [],
					variationSelectionInitialized: false,
					optionSelections: existing.map((row, idx) => ({ ...row, sortOrder: idx })),
				});
				await queryClient.invalidateQueries({ queryKey: optionKeys.list(false) });
				showSuccess("Option created.");
				router.replace({
					pathname: toScopedRoute(PRODUCT_OPTION_VALUES_ROUTE) as any,
					params: {
						[DRAFT_ID_KEY]: draft.draftId,
						[OPTION_SET_ID_KEY]: created.id,
						[RETURN_TO_KEY]: toScopedRoute(PRODUCT_SELECT_OPTIONS_ROUTE),
						[ROOT_RETURN_TO_KEY]: rootReturnTo,
						...(productId ? { [PRODUCT_ID_KEY]: productId } : {}),
					} as any,
				});
			} catch (e: any) {
				const payload = e?.response?.data;
				const message =
					payload?.message ??
					payload?.error ??
					payload?.errorMessage ??
					payload?.error?.message ??
					"Failed to create option.";
				showError(String(message));
			}
		});
	}, [
		canCreate,
		draft.draftId,
		draft.optionSelections,
		draft.selectedOptionSetIds,
		normalizedDisplayName,
		normalizedSetName,
		optionValues,
		patch,
		productId,
		queryClient,
		router,
		showError,
		showSuccess,
		rootReturnTo,
		toScopedRoute,
		withBusy,
	]);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom style={styles.root}>
				<Pressable style={styles.root} onPress={Keyboard.dismiss}>
					<BAIHeader
						title='Create Option'
						variant='exit'
						onLeftPress={onBack}
						onRightPress={onCreate}
						rightDisabled={!canCreate}
						rightSlot={({ disabled }) => <BAIHeaderActionButton label='Create' disabled={disabled} />}
					/>
					<BAISurface
						bordered
						style={[styles.panel, { borderColor: theme.colors.outlineVariant ?? theme.colors.outline }]}
					>
						<BAITextInput
							label='Option set'
							value={optionSetName}
							onChangeText={(value) => {
								const nextValue = clampText(toTitleCase(value), FIELD_LIMITS.modifierSetName);
								setOptionSetName(nextValue);
								if (isDisplayNameLinked) {
									setDisplayName(nextValue);
								}
							}}
							returnKeyType='next'
							blurOnSubmit={false}
							onSubmitEditing={() => {
								displayNameInputRef.current?.focus?.();
							}}
							maxLength={FIELD_LIMITS.modifierSetName}
							placeholder='e.g. Size'
							disabled={isDisabled}
						/>
						<BAITextInput
							ref={displayNameInputRef}
							label='Display name'
							value={displayName}
							onChangeText={(value) => {
								setDisplayName(clampText(toTitleCase(value), FIELD_LIMITS.modifierSetName));
								setIsDisplayNameLinked(false);
							}}
							returnKeyType='next'
							blurOnSubmit={false}
							onSubmitEditing={() => {
								addOptionInputRef.current?.focus?.();
							}}
							maxLength={FIELD_LIMITS.modifierSetName}
							placeholder='e.g. Size'
							disabled={isDisabled}
						/>

						<BAIText variant='subtitle' style={styles.optionsTitle}>
							{(normalizedDisplayName || normalizedSetName).trim()} Options
						</BAIText>

						<DraggableFlatList
							data={optionValues}
							keyExtractor={(item) => item}
							scrollEnabled={!isDragActive}
							showsVerticalScrollIndicator={false}
							keyboardShouldPersistTaps='handled'
							onDragBegin={() => {
								closeDeleteReveal();
								setIsDragActive(true);
							}}
							onDragEnd={({ data }) => {
								setIsDragActive(false);
								setOptionValues(data);
							}}
							renderItem={({ item, drag, isActive }) => {
								const isDeleteRevealed = deleteRevealValue === item;
								const gesture = PanResponder.create({
									onStartShouldSetPanResponder: () => false,
									onMoveShouldSetPanResponder: (_evt, gestureState) => {
										if (isDisabled || isDragActive) return false;
										return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
									},
									onPanResponderRelease: (_evt, gestureState) => {
										if (isDisabled || isDragActive) return;
										if (gestureState.dx < -24) {
											if (deleteRevealValue !== item) {
												void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
											}
											toggleDeleteReveal(item);
											return;
										}
										if (gestureState.dx > 24 && isDeleteRevealed) {
											closeDeleteReveal();
										}
									},
								});

								return (
									<View style={styles.valueRow} {...gesture.panHandlers}>
										<Animated.View
											style={[styles.valueMainWrap, isDeleteRevealed ? { marginRight: optionMainInsetRight } : null]}
										>
											<Pressable onPressIn={drag} disabled={isDisabled} style={styles.dragButton} hitSlop={8}>
												<MaterialCommunityIcons
													name='drag'
													size={24}
													color={theme.colors.onSurfaceVariant}
													style={styles.dragIcon}
												/>
											</Pressable>
											<View
												style={[
													styles.valueRowMain,
													{
														borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
														backgroundColor: isActive
															? theme.colors.surfaceDisabled
															: (theme.colors.surfaceVariant ?? theme.colors.surface),
													},
												]}
											>
												<BAIText variant='body' style={styles.valueName} numberOfLines={1} ellipsizeMode='tail'>
													{item}
												</BAIText>
												<Pressable
													onPress={() => {
														if (!isDeleteRevealed) {
															void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
														}
														toggleDeleteReveal(item);
													}}
													disabled={isDisabled || isDragActive}
													style={styles.minusBtnSlot}
													hitSlop={8}
												>
													<View style={[styles.minusBtnFill, { backgroundColor: theme.colors.error }]}>
														<Animated.View style={{ transform: [{ rotate: deleteIconRotate }] }}>
															<MaterialCommunityIcons name='minus' size={16} color={theme.colors.onError} />
														</Animated.View>
													</View>
												</Pressable>
											</View>
										</Animated.View>
										{isDeleteRevealed ? (
											<Animated.View
												style={[
													styles.deleteActionWrap,
													{ transform: [{ translateX: deleteActionTranslateX }], opacity: deleteActionOpacity },
												]}
											>
												<Pressable
													onPress={() => {
														if (isDisabled) return;
														setOptionValues((prev) => prev.filter((value) => value !== item));
														resetDeleteRevealAnimationValues();
														setDeleteRevealValue(null);
													}}
													style={[styles.deleteActionBtn, { backgroundColor: theme.colors.error }]}
												>
													<BAIText variant='subtitle' style={{ color: theme.colors.onError, fontWeight: "700" }}>
														Delete
													</BAIText>
												</Pressable>
											</Animated.View>
										) : null}
									</View>
								);
							}}
							ListFooterComponent={
								<View style={styles.addWrap}>
									<BAITextInput
										ref={addOptionInputRef}
										style={styles.addOptionInput}
										label='Add option'
										value={optionDraft}
										onChangeText={(value) => setOptionDraft(clampText(toTitleCase(value), FIELD_LIMITS.modifierName))}
										onBlur={() =>
											setOptionDraft((prev) =>
												clampText(toTitleCase(sanitizeLabelInput(prev)), FIELD_LIMITS.modifierName),
											)
										}
										returnKeyType='done'
										blurOnSubmit={false}
										onSubmitEditing={addOptionValue}
										maxLength={FIELD_LIMITS.modifierName}
										placeholder='e.g. Small'
										disabled={isDisabled}
									/>
									<View style={{ height: scrollSpacerHeight }} />
								</View>
							}
						/>
					</BAISurface>
				</Pressable>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	panel: {
		flex: 1,
		marginHorizontal: 8,
		marginTop: 0,
		borderRadius: 20,
		paddingHorizontal: 8,
		paddingTop: 0,
		paddingBottom: 10,
		overflow: "hidden",
	},
	optionsTitle: {
		marginTop: 2,
		marginBottom: 4,
	},
	valueRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 6,
		paddingHorizontal: 4,
		position: "relative",
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
	},
	valueMainWrap: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	dragButton: {
		alignItems: "center",
		justifyContent: "center",
	},
	dragIcon: {
		marginLeft: -2,
		marginRight: -2,
	},
	valueRowMain: {
		flex: 1,
		height: 56,
		minHeight: 56,
		maxHeight: 56,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: 1,
		borderRadius: 16,
		paddingLeft: 16,
		paddingRight: 10,
	},
	valueName: { flex: 1 },
	minusBtnSlot: {
		width: 30,
		height: 30,
		alignItems: "center",
		justifyContent: "center",
	},
	minusBtnFill: {
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	deleteActionWrap: {
		position: "absolute",
		right: 0,
		top: 0,
		bottom: 0,
		justifyContent: "center",
		paddingLeft: DELETE_ACTION_GAP,
	},
	deleteActionBtn: {
		width: 88,
		height: 56,
		marginLeft: 6,
		borderRadius: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	addWrap: {
		marginTop: 2,
		gap: 6,
	},
	addOptionInput: {
		marginLeft: 26,
	},
});
