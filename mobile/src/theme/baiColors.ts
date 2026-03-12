// path: src/theme/baiColors.ts

/**
 * =====================================================
 * RAW PALETTE — never imported by components directly
 * =====================================================
 */
export const baiColors = {
	gray: {
		50: "#F9FAFB",
		100: "#F3F4F6",
		200: "#E5E7EB",
		300: "#D1D5DB",
		400: "#9CA3AF",
		500: "#6B7280",
		600: "#4B5563",
		700: "#374151",
		800: "#1F2937",
		900: "#111827",
	},
	neutral: {
		50: "#FAFAFA",
		100: "#F5F5F5",
		200: "#E5E5E5",
		300: "#D4D4D4",
		400: "#A3A3A3",
		500: "#737373",
		600: "#525252",
		700: "#404040",
		800: "#262626",
		850: "#1F1F1F",
		900: "#171717",
		950: "#0A0A0A",
	},
	blue: {
		50: "#EFF6FF",
		100: "#DBEAFE",
		200: "#BFDBFE",
		300: "#93C5FD",
		400: "#60A5FA",
		500: "#3B82F6",
		600: "#2563EB",
		700: "#1D4ED8",
		800: "#1E40AF",
		900: "#1E3A8A",
	},
	indigo: {
		50: "#EEF2FF",
		100: "#E0E7FF",
		200: "#C7D2FE",
		300: "#A5B4FC",
		400: "#818CF8",
		500: "#6366F1",
		600: "#4F46E5",
		700: "#4338CA",
		800: "#3730A3",
		900: "#312E81",
	},
	green: {
		50: "#F0FDF4",
		100: "#DCFCE7",
		200: "#BBF7D0",
		300: "#86EFAC",
		400: "#4ADE80",
		500: "#22C55E",
		600: "#16A34A",
		700: "#15803D",
		800: "#166534",
		900: "#14532D",
	},
	orange: {
		50: "#FFF7ED",
		100: "#FFEDD5",
		200: "#FED7AA",
		300: "#FDBA74",
		400: "#FB923C",
		500: "#F97316",
		600: "#EA580C",
		700: "#C2410C",
		800: "#9A3412",
		900: "#7C2D12",
	},
	red: {
		50: "#FEF2F2",
		100: "#FEE2E2",
		200: "#FECACA",
		300: "#FCA5A5",
		400: "#F87171",
		500: "#EF4444",
		600: "#DC2626",
		700: "#B91C1C",
		800: "#991B1B",
		900: "#7F1D1D",
	},
	cyan: {
		50: "#ECFEFF",
		100: "#CFFAFE",
		200: "#A5F3FC",
		300: "#67E8F9",
		400: "#22D3EE",
		500: "#06B6D4",
		600: "#0891B2",
		700: "#0E7490",
		800: "#155E75",
		900: "#164E63",
	},

	// ✅ Added: TEAL (bridge between cyan and green; enterprise-safe accent)
	teal: {
		50: "#F0FDFA",
		100: "#CCFBF1",
		200: "#99F6E4",
		300: "#5EEAD4",
		400: "#2DD4BF",
		500: "#14B8A6",
		600: "#0D9488",
		700: "#0F766E",
		800: "#115E59",
		900: "#134E4A",
	},
} as const;

const appleDarkTokens = {
	background: "#000000",
	secondarySystemBackground: "#1C1C1E",
	tertiarySystemBackground: "#2C2C2E",
	quaternarySystemBackground: "#3A3A3C",
	separator: "#38383A",
	opaqueSeparator: "#545458",
	label: "#FFFFFF",
	secondaryLabel: "rgba(235, 235, 245, 0.6)",
	tertiaryLabel: "rgba(235, 235, 245, 0.3)",
	systemBlue: "#0A84FF",
	systemBlueEmphasis: "#409CFF",
	systemIndigo: "#5E5CE6",
	systemIndigoEmphasis: "#7D7AFF",
	systemRed: "#FF453A",
} as const;

const appleLightTokens = {
	background: "#F2F2F7",
	secondarySystemBackground: "#FFFFFF",
	tertiarySystemBackground: "#FFFFFF",
	separator: "#D1D1D6",
	opaqueSeparator: "#C6C6C8",
	label: "#000000",
	secondaryLabel: "rgba(60, 60, 67, 0.6)",
	tertiaryLabel: "rgba(60, 60, 67, 0.3)",
	systemBlue: "#007AFF",
	systemBlueEmphasis: "#0060DF",
	systemIndigo: "#5856D6",
	systemIndigoEmphasis: "#4A48C4",
	systemRed: "#FF3B30",
} as const;

/**
 * =====================================================
 * SEMANTIC TOKENS — consumed by components & theme
 * =====================================================
 */
export const baiSemanticColors = {
	primary: {
		main: appleLightTokens.systemBlue,
		dark: appleDarkTokens.systemBlue,
		soft: baiColors.blue[50],
		softBorder: baiColors.blue[200],
	},
	secondary: {
		main: appleLightTokens.systemIndigo,
		dark: appleDarkTokens.systemIndigo,
		soft: baiColors.indigo[50],
		softBorder: baiColors.indigo[200],
	},
	success: {
		main: "#34C759",
		dark: "#30D158",
		soft: baiColors.green[50],
		softBorder: baiColors.green[200],
	},
	warning: {
		main: "#FF9500",
		dark: "#FF9F0A",
		soft: baiColors.orange[50],
		softBorder: baiColors.orange[200],
	},
	error: {
		main: appleLightTokens.systemRed,
		dark: appleDarkTokens.systemRed,
		soft: baiColors.red[50],
		softBorder: baiColors.red[200],
	},
	info: {
		main: "#5AC8FA",
		dark: "#64D2FF",
		soft: baiColors.cyan[50],
		softBorder: baiColors.cyan[200],
	},

	// ✅ Added: TEAL semantic group
	teal: {
		main: "#30B0C7",
		dark: "#40C8E0",
		soft: baiColors.teal[50],
		softBorder: baiColors.teal[200],
	},

	neutral: {
		main: baiColors.neutral[500],
		dark: baiColors.neutral[600],
		soft: baiColors.neutral[50],
		softBorder: baiColors.neutral[200],
	},

	// 🧱 LIGHT MODE SURFACES
	surfaces: {
		background: appleLightTokens.background,
		backgroundAlt: appleLightTokens.secondarySystemBackground,
		surface: appleLightTokens.secondarySystemBackground,
		surfaceSubtle: appleLightTokens.tertiarySystemBackground,
		borderSubtle: appleLightTokens.separator,
		borderStrong: appleLightTokens.opaqueSeparator,
	},

	// 🧱 DARK MODE SURFACES
	surfacesDark: {
		background: appleDarkTokens.background,
		surface: appleDarkTokens.secondarySystemBackground,
		surfaceElevated: appleDarkTokens.tertiarySystemBackground,
		surfaceVariant: appleDarkTokens.quaternarySystemBackground,
		borderSubtle: appleDarkTokens.separator,
		borderStrong: appleDarkTokens.opaqueSeparator,
	},

	// 🔤 LIGHT MODE TEXT
	text: {
		primary: appleLightTokens.label,
		secondary: appleLightTokens.secondaryLabel,
		muted: appleLightTokens.tertiaryLabel,
		onPrimary: "#FFFFFF",
		onSuccess: "#F8FAFC",
		onDark: "#F9FAFB",
	},

	// 🔤 DARK MODE TEXT
	textDark: {
		primary: appleDarkTokens.label,
		secondary: appleDarkTokens.secondaryLabel,
		muted: appleDarkTokens.tertiaryLabel,
		onPrimary: "#FFFFFF",
	},
} as const;

/**
 * =====================================================
 * BUTTON CONTRACTS
 * =====================================================
 */
export type BAIButtonIntent =
	| "primary"
	| "secondary"
	| "success"
	| "warning"
	| "error"
	| "danger"
	| "info"
	| "neutral"
	| "teal";

export type BAIButtonVariant = "solid" | "outline" | "soft" | "subtle" | "ghost" | "inverse";

export type BAIButtonColorConfig = {
	background: string;
	border: string;
	text: string;
};

/**
 * Centralized disabled visuals (non-primary).
 * NOTE: Primary solid disabled is handled separately to keep blue-family governance.
 */
export const baiButtonDisabled = {
	light: {
		background: appleLightTokens.background,
		border: appleLightTokens.separator,
		text: "#8E8E93",
	},
	dark: {
		background: baiSemanticColors.surfacesDark.surfaceElevated,
		border: baiSemanticColors.surfacesDark.borderSubtle,
		text: baiSemanticColors.textDark.muted,
	},
} as const;

/**
 * Masterplan governance:
 * - Primary solid disabled stays BLUE family (not gray)
 * - White text always on primary solid
 */
export const baiButtonPrimaryDisabledSolid = {
	light: {
		background: baiColors.blue[600] + "80", // 50% alpha (8-digit hex)
		border: baiColors.blue[600] + "80",
		text: "#FFFFFF",
	},
	dark: {
		background: baiColors.blue[500] + "80", // 50% alpha
		border: baiColors.blue[500] + "80",
		text: "#FFFFFF",
	},
} as const;

/**
 * Masterplan pressed-state (primary solid only)
 * Light pressed: #1D4ED8
 * Dark  pressed: #2563EB
 */
export const baiButtonPrimaryPressedSolid = {
	light: {
		background: baiColors.blue[700], // #1D4ED8
		border: baiColors.blue[700],
		text: "#FFFFFF",
	},
	dark: {
		background: baiColors.blue[600], // #2563EB
		border: baiColors.blue[600],
		text: "#FFFFFF",
	},
} as const;

type IntentGroup = {
	main: string;
	dark: string;
	soft: string;
	softBorder: string;
};

const inverseVariantLight: BAIButtonColorConfig = {
	background: appleLightTokens.label,
	border: appleLightTokens.label,
	text: "#FFFFFF",
};

const inverseVariantDark: BAIButtonColorConfig = {
	background: baiSemanticColors.surfacesDark.surfaceElevated,
	border: baiSemanticColors.surfacesDark.borderSubtle,
	text: "#FFFFFF",
};

function buildIntentTheme(
	group: IntentGroup,
	onFillText: string,
	inverseVariant: BAIButtonColorConfig,
): Record<BAIButtonVariant, BAIButtonColorConfig> {
	return {
		solid: {
			background: group.main,
			border: group.main,
			text: onFillText,
		},
		outline: {
			background: "transparent",
			border: group.main,
			text: group.dark,
		},
		soft: {
			background: group.soft,
			border: group.softBorder,
			text: group.dark,
		},
		subtle: {
			background: appleLightTokens.background,
			border: appleLightTokens.separator,
			text: appleLightTokens.label,
		},
		ghost: {
			background: "transparent",
			border: "transparent",
			text: group.main,
		},
		inverse: inverseVariant,
	};
}

/**
 * Mode-aware PRIMARY per masterplan:
 * - Light: blue[600]
 * - Dark:  blue[500]
 * Hue remains constant; luminance shifts by mode.
 */
const primaryGroupLight: IntentGroup = {
	main: appleLightTokens.systemBlue,
	dark: appleLightTokens.systemBlueEmphasis,
	soft: baiColors.blue[50],
	softBorder: baiColors.blue[200],
};

const primaryGroupDark: IntentGroup = {
	main: appleDarkTokens.systemBlue,
	dark: appleDarkTokens.systemBlueEmphasis,
	soft: baiColors.blue[50],
	softBorder: baiColors.blue[200],
};

const secondaryGroupLight: IntentGroup = {
	main: appleLightTokens.systemIndigo,
	dark: appleLightTokens.systemIndigoEmphasis,
	soft: baiColors.indigo[50],
	softBorder: baiColors.indigo[200],
};
const secondaryGroupDark: IntentGroup = {
	main: appleDarkTokens.systemIndigo,
	dark: appleDarkTokens.systemIndigoEmphasis,
	soft: baiColors.indigo[50],
	softBorder: baiColors.indigo[200],
};

const primaryThemeLight = buildIntentTheme(primaryGroupLight, "#FFFFFF", inverseVariantLight);
const primaryThemeDark = buildIntentTheme(primaryGroupDark, "#FFFFFF", inverseVariantDark);
const secondaryThemeLight = buildIntentTheme(secondaryGroupLight, "#FFFFFF", inverseVariantLight);
const secondaryThemeDark = buildIntentTheme(secondaryGroupDark, "#FFFFFF", inverseVariantDark);

// Other semantic intents remain stable; only primary is strictly governed to enterprise-blue.
const successThemeLight: Record<BAIButtonVariant, BAIButtonColorConfig> = {
	...buildIntentTheme(baiSemanticColors.success, baiSemanticColors.text.onSuccess, inverseVariantLight),
	solid: {
		background: baiSemanticColors.success.main,
		border: baiSemanticColors.success.main,
		text: "#F8FAFC",
	},
};

const successThemeDark: Record<BAIButtonVariant, BAIButtonColorConfig> = {
	...buildIntentTheme(baiSemanticColors.success, baiSemanticColors.text.onSuccess, inverseVariantDark),
	solid: {
		background: baiSemanticColors.success.main,
		border: baiSemanticColors.success.main,
		text: "#F8FAFC",
	},
};

const warningThemeLight: Record<BAIButtonVariant, BAIButtonColorConfig> = {
	...buildIntentTheme(baiSemanticColors.warning, baiSemanticColors.text.onPrimary, inverseVariantLight),
	solid: {
		background: baiSemanticColors.warning.main,
		border: baiSemanticColors.warning.main,
		text: "#111827",
	},
};

const warningThemeDark: Record<BAIButtonVariant, BAIButtonColorConfig> = {
	...buildIntentTheme(baiSemanticColors.warning, baiSemanticColors.text.onPrimary, inverseVariantDark),
	solid: {
		background: baiSemanticColors.warning.main,
		border: baiSemanticColors.warning.main,
		text: "#111827",
	},
};

const errorThemeLight = buildIntentTheme(
	baiSemanticColors.error,
	baiSemanticColors.text.onPrimary,
	inverseVariantLight,
);
const errorThemeDark = buildIntentTheme(baiSemanticColors.error, baiSemanticColors.text.onPrimary, inverseVariantDark);
const infoThemeLight = buildIntentTheme(baiSemanticColors.info, baiSemanticColors.text.onPrimary, inverseVariantLight);
const infoThemeDark = buildIntentTheme(baiSemanticColors.info, baiSemanticColors.text.onPrimary, inverseVariantDark);

// ✅ Added: teal theme
const tealThemeLight = buildIntentTheme(baiSemanticColors.teal, "#FFFFFF", inverseVariantLight);
const tealThemeDark = buildIntentTheme(baiSemanticColors.teal, "#FFFFFF", inverseVariantDark);

const neutralThemeLight: Record<BAIButtonVariant, BAIButtonColorConfig> = {
	...buildIntentTheme(baiSemanticColors.neutral, baiSemanticColors.text.onPrimary, inverseVariantLight),
	solid: {
		background: baiColors.neutral[500],
		border: baiColors.neutral[600],
		text: baiSemanticColors.text.onPrimary,
	},
	subtle: {
		background: appleLightTokens.background,
		border: appleLightTokens.separator,
		text: appleLightTokens.label,
	},
	outline: {
		background: "transparent",
		border: baiSemanticColors.neutral.main,
		text: baiSemanticColors.neutral.dark,
	},
};

const neutralThemeDark: Record<BAIButtonVariant, BAIButtonColorConfig> = {
	...buildIntentTheme(baiSemanticColors.neutral, baiSemanticColors.text.onPrimary, inverseVariantDark),
	subtle: {
		background: baiSemanticColors.surfacesDark.surfaceElevated,
		border: baiSemanticColors.surfacesDark.borderSubtle,
		text: baiSemanticColors.textDark.primary,
	},
	outline: {
		background: "transparent",
		border: baiSemanticColors.neutral.main,
		text: baiSemanticColors.neutral.dark,
	},
};

const dangerThemeLight = buildIntentTheme(
	{
		main: baiColors.red[700],
		dark: baiColors.red[800],
		soft: baiColors.red[50],
		softBorder: baiColors.red[200],
	},
	"#FFFFFF",
	inverseVariantLight,
);

const dangerThemeDark = buildIntentTheme(
	{
		main: baiColors.red[700],
		dark: baiColors.red[800],
		soft: baiColors.red[50],
		softBorder: baiColors.red[200],
	},
	"#FFFFFF",
	inverseVariantDark,
);

export const baiButtonThemeByMode: Record<
	"light" | "dark",
	Record<BAIButtonIntent, Record<BAIButtonVariant, BAIButtonColorConfig>>
> = {
	light: {
		primary: primaryThemeLight,
		secondary: secondaryThemeLight,
		success: successThemeLight,
		warning: warningThemeLight,
		error: errorThemeLight,
		danger: dangerThemeLight,
		info: infoThemeLight,
		neutral: neutralThemeLight,
		teal: tealThemeLight,
	},
	dark: {
		primary: primaryThemeDark,
		secondary: secondaryThemeDark,
		success: successThemeDark,
		warning: warningThemeDark,
		error: errorThemeDark,
		danger: dangerThemeDark,
		info: infoThemeDark,
		neutral: neutralThemeDark,
		teal: tealThemeDark,
	},
};

/**
 * Backward compatibility:
 * Keep existing name; default to light theme.
 */
export const baiButtonTheme = baiButtonThemeByMode.light;
