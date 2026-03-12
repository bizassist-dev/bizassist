// path: src/theme/baiTheme.ts

import { MD3DarkTheme as DefaultDarkTheme, MD3LightTheme as DefaultLightTheme, MD3Theme } from "react-native-paper";
import { baiButtonDisabled, baiColors, baiSemanticColors } from "./baiColors";
import { baiRadius } from "./baiRadius";

/**
 * Theme contract:
 * - roundness comes from baiRadius (single source of truth)
 * - colors from baiSemanticColors, with enterprise-SaaS surfaces
 */

const baseLight: MD3Theme = {
	...DefaultLightTheme,
	roundness: baiRadius.md,
	colors: {
		...DefaultLightTheme.colors,

		primary: "#007AFF",
		primaryContainer: "#5AC8FA",

		secondary: "#5856D6",
		secondaryContainer: "#7875FF",

		background: baiSemanticColors.surfaces.background,
		surface: baiSemanticColors.surfaces.surface,
		surfaceVariant: baiSemanticColors.surfaces.surfaceSubtle,

		// Borders — Apple-style light separators
		outline: baiSemanticColors.surfaces.borderSubtle,
		outlineVariant: baiSemanticColors.surfaces.borderStrong,

		error: "#FF3B30",
		errorContainer: baiSemanticColors.error.soft,

		onPrimary: baiSemanticColors.text.onPrimary,
		onSecondary: baiSemanticColors.text.onPrimary,
		onBackground: baiSemanticColors.text.primary,
		onSurface: baiSemanticColors.text.primary,
		onSurfaceVariant: baiSemanticColors.text.secondary,
		onError: baiSemanticColors.text.onPrimary,

		surfaceDisabled: baiButtonDisabled.light.background,
		onSurfaceDisabled: baiButtonDisabled.light.text,

		backdrop: "rgba(0, 0, 0, 0.18)",
	},
};

const baseDark: MD3Theme = {
	...DefaultDarkTheme,
	roundness: baiRadius.md,
	colors: {
		...DefaultDarkTheme.colors,

		primary: "#0A84FF",
		primaryContainer: "#409CFF",

		secondary: "#5E5CE6",
		secondaryContainer: "#7D7AFF",

		background: baiSemanticColors.surfacesDark.background,
		surface: baiSemanticColors.surfacesDark.surface,
		surfaceVariant: baiSemanticColors.surfacesDark.surfaceVariant,

		// Borders — Apple-style dark separators
		outline: baiSemanticColors.surfacesDark.borderSubtle,
		outlineVariant: baiSemanticColors.surfacesDark.borderStrong,

		error: "#FF453A",
		errorContainer: baiColors.red[900],

		onPrimary: baiSemanticColors.textDark.onPrimary,
		onSecondary: baiSemanticColors.textDark.onPrimary,
		onBackground: baiSemanticColors.textDark.primary,
		onSurface: baiSemanticColors.textDark.primary,
		onSurfaceVariant: baiSemanticColors.textDark.secondary,
		onError: baiSemanticColors.textDark.onPrimary,

		surfaceDisabled: baiButtonDisabled.dark.background,
		onSurfaceDisabled: baiButtonDisabled.dark.text,

		backdrop: "rgba(0, 0, 0, 0.72)",
	},
};

export const baiLightTheme = baseLight;
export const baiDarkTheme = baseDark;
export type BaiTheme = typeof baiLightTheme;
