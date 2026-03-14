import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";

export type BAIGroupTab<T extends string> = {
	label: string;
	value: T;
	count?: number;
};

type BAIGroupTabsProps<T extends string> = {
	tabs: readonly BAIGroupTab<T>[];
	value: T;
	onChange: (value: T) => void;
	disabled?: boolean;
	countFormatter?: (count: number) => string;
};

const CONTAINER_INSET = 4;
const TAB_GAP = 0;
const TAB_ANIMATION_DURATION_MS = 240;
const CHANGE_DISPATCH_DELAY_MS = 180;

export function BAIGroupTabs<T extends string>({
	tabs,
	value,
	onChange,
	disabled,
	countFormatter,
}: BAIGroupTabsProps<T>) {
	const theme = useTheme();

	const containerBg =
		(theme.colors as typeof theme.colors & { surfaceInteractive?: string }).surfaceInteractive ??
		theme.colors.surfaceVariant ??
		theme.colors.surface;
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const activeBg = theme.colors.primary;
	const activeTextColor = theme.colors.onPrimary ?? "#FFFFFF";
	const idleTextColor = theme.colors.onSurface;

	const activeIndex = useMemo(() => {
		const index = tabs.findIndex((tab) => tab.value === value);
		return index >= 0 ? index : 0;
	}, [tabs, value]);

	const [rowWidth, setRowWidth] = useState(0);
	const activeTranslateX = useRef(new Animated.Value(0)).current;
	const activeOpacity = useRef(new Animated.Value(0)).current;
	const activeIndexProgress = useRef(new Animated.Value(activeIndex)).current;
	const activeIndicatorReadyRef = useRef(false);
	const targetActiveIndexRef = useRef(activeIndex);
	const pendingChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const activeSegmentWidth = useMemo(() => {
		if (rowWidth <= 0 || tabs.length === 0) return 0;
		const totalGapWidth = TAB_GAP * Math.max(tabs.length - 1, 0);
		return (rowWidth - totalGapWidth) / tabs.length;
	}, [rowWidth, tabs.length]);

	const animateToIndex = useCallback(
		(nextIndex: number) => {
			if (activeSegmentWidth <= 0) return;
			const nextTranslateX = nextIndex * (activeSegmentWidth + TAB_GAP);
			targetActiveIndexRef.current = nextIndex;
			activeTranslateX.stopAnimation();
			activeOpacity.stopAnimation();
			activeIndexProgress.stopAnimation();

			Animated.parallel([
				Animated.timing(activeTranslateX, {
					toValue: nextTranslateX,
					duration: TAB_ANIMATION_DURATION_MS,
					easing: Easing.out(Easing.cubic),
					useNativeDriver: false,
				}),
				Animated.timing(activeIndexProgress, {
					toValue: nextIndex,
					duration: TAB_ANIMATION_DURATION_MS,
					easing: Easing.out(Easing.cubic),
					useNativeDriver: false,
				}),
			]).start();
		},
		[activeIndexProgress, activeOpacity, activeSegmentWidth, activeTranslateX],
	);

	useEffect(() => {
		const nextTranslateX = activeIndex * (activeSegmentWidth + TAB_GAP);
		if (!activeIndicatorReadyRef.current) {
			activeTranslateX.setValue(nextTranslateX);
			activeOpacity.setValue(1);
			activeIndexProgress.setValue(activeIndex);
			activeIndicatorReadyRef.current = true;
			targetActiveIndexRef.current = activeIndex;
			return;
		}

		if (activeSegmentWidth <= 0) return;
		if (targetActiveIndexRef.current === activeIndex) return;
		animateToIndex(activeIndex);
	}, [activeIndex, activeIndexProgress, activeOpacity, activeSegmentWidth, activeTranslateX, animateToIndex]);

	useEffect(() => {
		return () => {
			if (pendingChangeTimeoutRef.current !== null) {
				clearTimeout(pendingChangeTimeoutRef.current);
			}
		};
	}, []);

	const onTabPress = useCallback(
		(tabValue: T, index: number) => {
			if (disabled) return;
			if (tabValue === value) return;
			if (targetActiveIndexRef.current !== index) {
				animateToIndex(index);
			}
			if (pendingChangeTimeoutRef.current !== null) {
				clearTimeout(pendingChangeTimeoutRef.current);
			}
			pendingChangeTimeoutRef.current = setTimeout(() => {
				pendingChangeTimeoutRef.current = null;
				startTransition(() => {
					onChange(tabValue);
				});
			}, CHANGE_DISPATCH_DELAY_MS);
		},
		[animateToIndex, disabled, onChange, value],
	);

	return (
		<View
			style={[
				styles.container,
				{
					backgroundColor: containerBg,
					borderColor,
					opacity: disabled ? 0.55 : 1,
				},
			]}
		>
			<View
				style={styles.row}
				onLayout={(event) => {
					const nextWidth = event.nativeEvent.layout.width;
					if (nextWidth > 0 && Math.abs(nextWidth - rowWidth) > 0.5) {
						setRowWidth(nextWidth);
					}
				}}
			>
				{activeSegmentWidth > 0 ? (
					<Animated.View
						pointerEvents='none'
						style={[
							styles.activeIndicator,
							{
								width: activeSegmentWidth,
								backgroundColor: activeBg,
								opacity: activeOpacity,
								transform: [{ translateX: activeTranslateX }],
							},
						]}
					/>
				) : null}

				{tabs.map((tab, index) => {
					const showCount = typeof tab.count === "number" && Number.isFinite(tab.count);
					const formattedCount =
						showCount && countFormatter ? countFormatter(tab.count as number) : showCount ? String(tab.count) : "";
					const displayLabel = showCount ? `${tab.label} ${formattedCount}` : tab.label;
					const animatedTextColor = activeIndexProgress.interpolate({
						inputRange: [index - 1, index, index + 1],
						outputRange: [idleTextColor, activeTextColor, idleTextColor],
						extrapolate: "clamp",
					});
					const animatedTextOpacity = activeIndexProgress.interpolate({
						inputRange: [index - 1, index, index + 1],
						outputRange: [0.82, 1, 0.82],
						extrapolate: "clamp",
					});

					return (
						<Pressable
							key={tab.value}
							onPress={() => onTabPress(tab.value, index)}
							disabled={disabled}
							accessibilityRole='button'
							accessibilityState={tab.value === value ? { selected: true, disabled: !!disabled } : {}}
							style={({ pressed }) => [styles.tab, pressed && !disabled ? styles.tabPressed : null]}
						>
							<Animated.Text
								numberOfLines={1}
								adjustsFontSizeToFit
								minimumFontScale={0.75}
								style={[styles.label, { color: animatedTextColor, opacity: animatedTextOpacity }]}
							>
								{displayLabel}
							</Animated.Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		borderRadius: 999,
		padding: CONTAINER_INSET,
		minHeight: 44,
		borderWidth: 1,
	},
	row: {
		position: "relative",
		flexDirection: "row",
		alignItems: "center",
		minHeight: 36,
		gap: TAB_GAP,
	},
	activeIndicator: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		borderRadius: 999,
	},
	tab: {
		flex: 1,
		alignItems: "center",
		minHeight: 36,
		paddingVertical: 8,
		paddingHorizontal: 4,
		borderRadius: 999,
		justifyContent: "center",
		zIndex: 1,
	},
	tabPressed: {
		opacity: 0.92,
	},
	label: {
		fontSize: 12,
		fontWeight: "400",
	},
});
