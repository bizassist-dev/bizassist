// BizAssist_mobile
// path: src/modules/navigation/useAppHeader.ts
//
// Header SSOT (flat stack header + Back vs Exit governance)
// - Back is history navigation only (router.back()).
// - Exit is intent-cancel (close icon), optionally deterministic via onExit.
// - Screen classes: workspace | detail | picker | process.

import React, { useMemo } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "react-native-paper";

import { BAIHeader } from "@/components/ui/BAIHeader";
import { runGovernedBack, runGovernedProcessExit } from "@/modules/inventory/navigation.governance";

export type AppScreenClass = "workspace" | "detail" | "picker" | "process";

export type UseAppHeaderOptions = {
	title?: string;
	headerBackTitle?: string;
	backLabel?: string;
	showAvatarPlaceholder?: boolean;
	disabled?: boolean;
	onBack?: () => void;
	onExit?: () => void;
	backFallbackRoute?: string;
	exitFallbackRoute?: string;
	exitReturnTo?: unknown;
};

export type AppHeaderOptions = {
	title?: string;
	headerBackTitle?: string;
	headerBackVisible?: boolean;
	headerLeft?: (props?: unknown) => React.ReactNode;
	headerStyle?: Record<string, unknown>;
	headerTintColor?: string;
	headerTitleStyle?: Record<string, unknown>;
	headerBackTitleStyle?: Record<string, unknown>;
	headerShadowVisible?: boolean;
	headerTitleAlign?: "center" | "left";
	[key: string]: unknown;
};

export function useAppHeader(screenClass: AppScreenClass, options?: UseAppHeaderOptions): AppHeaderOptions {
	const router = useRouter();
	const theme = useTheme();

	const title = options?.title;
	const headerBackTitle = options?.headerBackTitle ?? options?.backLabel;
	const showAvatarPlaceholder = !!options?.showAvatarPlaceholder;
	const disabled = !!options?.disabled;
	const onBack = options?.onBack;
	const onExit = options?.onExit;
	const backFallbackRoute = options?.backFallbackRoute;
	const exitFallbackRoute = options?.exitFallbackRoute;
	const exitReturnTo = options?.exitReturnTo;

	const headerBackTitleStyle = useMemo(
		() => ({
			fontSize: 14,
			fontWeight: "500" as const,
			color: theme.colors.onSurfaceVariant ?? theme.colors.onBackground,
		}),
		[theme.colors.onSurfaceVariant, theme.colors.onBackground],
	);

	const sharedBase = useMemo<AppHeaderOptions>(
		() => ({
			headerTitleAlign: "center",
			headerShadowVisible: false,
			headerStyle: {
				backgroundColor: theme.colors.background,
				...(Platform.OS === "android" ? { elevation: 0, borderBottomWidth: 0 } : {}),
			},
			headerTintColor: theme.colors.onBackground,
			headerTitleStyle: {
				color: theme.colors.onBackground,
				fontSize: 18,
				fontWeight: "600",
			},
			headerBackTitleStyle,
		}),
		[headerBackTitleStyle, theme.colors.background, theme.colors.onBackground],
	);

	return useMemo<AppHeaderOptions>(() => {
		const base: AppHeaderOptions = { ...sharedBase };
		if (title) base.title = title;
		if (headerBackTitle) base.headerBackTitle = headerBackTitle;

		if (screenClass === "workspace") {
			return {
				...base,
				headerBackVisible: false,
				headerLeft: () => null,
			};
		}

		if (screenClass === "detail" || screenClass === "picker") {
			return {
				...base,
				headerShown: true,
				header: () =>
					React.createElement(BAIHeader as any, {
						title: title ?? "",
						variant: "back",
						showAvatarPlaceholder,
						disabled,
						onLeftPress: () => {
							if (disabled) return;
							if (onBack) {
								onBack();
								return;
							}
							runGovernedBack({ router: router as any }, backFallbackRoute);
						},
					}),
			};
		}

		return {
			...base,
			headerShown: true,
			header: () =>
				React.createElement(BAIHeader as any, {
					title: title ?? "",
					variant: "exit",
					showAvatarPlaceholder,
					disabled,
					onLeftPress: () => {
						if (disabled) return;
						if (onExit) {
							onExit();
							return;
						}
						if (exitFallbackRoute) {
							runGovernedProcessExit(exitReturnTo, exitFallbackRoute, { router: router as any });
							return;
						}
						runGovernedBack({ router: router as any }, backFallbackRoute);
					},
				}),
		};
	}, [
		backFallbackRoute,
		disabled,
		exitFallbackRoute,
		exitReturnTo,
		headerBackTitle,
		onBack,
		onExit,
		router,
		screenClass,
		showAvatarPlaceholder,
		sharedBase,
		title,
	]);
}
