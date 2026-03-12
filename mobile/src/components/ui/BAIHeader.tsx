import React, { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "react-native-paper";

import { BAIHeaderIconButton } from "@/components/system/BAIHeaderIconButton";
import { BAIText } from "@/components/ui/BAIText";
import { useAppBusy } from "@/hooks/useAppBusy";
import { useResponsiveLayout } from "@/lib/layout/useResponsiveLayout";

export type BAIHeaderProps = {
	title: string;
	variant: "back" | "exit";
	rightSlot?: ReactNode | ((options: { disabled: boolean }) => ReactNode);
	barHeight?: number;
	rightRailWidth?: number;
	titleHorizontalPadding?: number;
	titleOffsetX?: number;
	onLeftPress?: () => void;
	onRightPress?: () => void;
	disabled?: boolean;
	rightDisabled?: boolean;
	guardBusy?: boolean;
	testID?: string;
};

const HEADER_BAR_HEIGHT = 56;
const HEADER_ACTION_HEIGHT_XXL = 58;
const HEADER_ACTION_WIDTH_XXL = 64;

export function BAIHeader({
	title,
	variant,
	rightSlot,
	barHeight = HEADER_BAR_HEIGHT,
	rightRailWidth,
	titleHorizontalPadding = 0,
	titleOffsetX = 0,
	onLeftPress,
	onRightPress,
	disabled = false,
	rightDisabled = false,
	guardBusy = true,
	testID,
}: BAIHeaderProps) {
	const router = useRouter();
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const { paddingX } = useResponsiveLayout();
	const { busy } = useAppBusy();
	const fallbackTopInset = initialWindowMetrics?.insets.top ?? 0;
	const resolvedTopInset = Math.max(insets.top, fallbackTopInset);

	const tapLockRef = useRef(false);
	const [isTapLocked, setIsTapLocked] = useState(false);

	const isBusyGuarded = guardBusy && busy.isBusy;
	const leftDisabled = disabled || isBusyGuarded || isTapLocked;
	const rightActionDisabled = disabled || rightDisabled || isBusyGuarded || isTapLocked;

	const lockTap = useCallback((ms = 650) => {
		if (tapLockRef.current) return false;
		tapLockRef.current = true;
		setIsTapLocked(true);
		setTimeout(() => {
			tapLockRef.current = false;
			setIsTapLocked(false);
		}, ms);
		return true;
	}, []);

	const handleLeftPress = useCallback(() => {
		if (leftDisabled) return;
		if (!lockTap()) return;
		if (onLeftPress) {
			onLeftPress();
			return;
		}
		router.back();
	}, [leftDisabled, lockTap, onLeftPress, router]);

	const handleRightPress = useCallback(() => {
		if (!onRightPress) return;
		if (rightActionDisabled) return;
		if (!lockTap()) return;
		onRightPress();
	}, [lockTap, onRightPress, rightActionDisabled]);

	const renderedRightSlot = useMemo(() => {
		if (!rightSlot) return null;
		if (typeof rightSlot === "function") {
			return rightSlot({ disabled: rightActionDisabled });
		}
		return rightSlot;
	}, [rightActionDisabled, rightSlot]);

	const resolvedBarHeight = Math.max(56, barHeight || HEADER_BAR_HEIGHT);
	const railSize = Math.max(HEADER_ACTION_WIDTH_XXL, resolvedBarHeight);
	const resolvedRightRailWidth = Math.max(HEADER_ACTION_WIDTH_XXL, rightRailWidth ?? railSize);
	const resolvedTitleOffsetX = (resolvedRightRailWidth - railSize) / 2 + titleOffsetX;
	const horizontalInset = Math.max(8, (paddingX || 16) - 4);

	return (
		<View
			testID={testID}
			style={[styles.root, { paddingTop: resolvedTopInset, backgroundColor: theme.colors.background }]}
		>
			<View style={[styles.bar, { height: resolvedBarHeight, paddingHorizontal: horizontalInset }]}>
				<View style={[styles.leftRail, { width: railSize }]}>
					<BAIHeaderIconButton
						variant={variant}
						disabled={leftDisabled}
						onPress={handleLeftPress}
						buttonStyle={styles.leftIconButton}
					/>
				</View>

				<View
					style={[styles.centerRail, titleHorizontalPadding > 0 ? { paddingHorizontal: titleHorizontalPadding } : null]}
				>
					<BAIText
						variant='title'
						numberOfLines={1}
						ellipsizeMode='tail'
						style={[
							styles.title,
							resolvedTitleOffsetX !== 0 ? { transform: [{ translateX: resolvedTitleOffsetX }] } : null,
						]}
					>
						{title}
					</BAIText>
				</View>

				<View style={[styles.rightRail, { width: resolvedRightRailWidth }]}>
					{onRightPress ? (
						<Pressable
							onPress={handleRightPress}
							disabled={rightActionDisabled}
							hitSlop={8}
							style={({ pressed }) => [styles.rightPressable, { width: resolvedRightRailWidth }, pressed && styles.rightPressed]}
						>
							{renderedRightSlot}
						</Pressable>
					) : (
						renderedRightSlot
					)}
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		width: "100%",
	},
	bar: {
		height: HEADER_BAR_HEIGHT,
		flexDirection: "row",
		alignItems: "center",
	},
	leftRail: {
		width: 56,
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
	},
	centerRail: {
		flex: 1,
		minWidth: 0,
		justifyContent: "center",
	},
	title: {
		textAlign: "center",
	},
	rightRail: {
		width: 56,
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
	},
	rightPressable: {
		width: HEADER_ACTION_WIDTH_XXL,
		height: HEADER_ACTION_HEIGHT_XXL,
		marginRight: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	rightPressed: {
		opacity: 0.75,
	},
	leftIconButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
	},
});
