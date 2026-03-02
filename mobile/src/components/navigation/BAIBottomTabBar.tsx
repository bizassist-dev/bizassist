// BizAssist_mobile
// path: src/components/navigation/BAIBottomTabBar.tsx
// Goals:
// - Works with BOTH tab aliases ("home") and folder index routes ("home/index").
// - "home" is canonical (no dashboard mapping).
// - Stable sizing + tablet-aware max width.
//
// UPDATE (tablet match phone):
// - Tablet uses the SAME compact floating pill style as phone.
// - No near-full-width tablet dock behavior.
// - Slightly larger maxWidth on tablet only, still compact and centered.
//
// UPDATE (GroupTabs spacing parity):
// - Equal inset all around (top/bottom == sides) and equal inter-tab spacing.
// - NO active-width mutation (prevents shifting).
// - Spacing is governed by pill padding + row gap (not item padding / space-between).

import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { usePathname, useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BAIText } from "@/components/ui/BAIText";

/* =========================
   Types + constants
   ========================= */

type CanonicalTab = "home" | "inventory" | "pos" | "settings";

const TAB_ORDER: CanonicalTab[] = ["pos", "inventory", "home", "settings"];
const CANONICAL_SET = new Set<CanonicalTab>(TAB_ORDER);

const ICONS: Record<CanonicalTab, keyof typeof MaterialCommunityIcons.glyphMap> = {
	home: "clipboard-clock-outline",
	inventory: "package-variant",
	pos: "cash-register",
	settings: "cog-outline",
};

const LABELS: Record<CanonicalTab, string> = {
	home: "Activity",
	inventory: "Inventory",
	pos: "POS",
	settings: "Settings",
};

const PILL_HEIGHT = 64;
const PILL_RADIUS = 999;

const INSET = 6; // matches visual intent of GroupTabs container padding model

/**
 * STRICT canonicalization.
 * Do NOT use substring fallbacks because this repo contains children like:
 * - "home/home.phone"
 * - "home/home.tablet"
 * which are NOT the tab roots.
 */
function toCanonical(routeName: string): CanonicalTab | null {
	const n = (routeName ?? "").toLowerCase().trim();

	// Home is an index route tab node.
	if (n === "home" || n === "home/index") return "home";

	// Inventory is a folder stack tab node (inventory has its own _layout.tsx),
	// therefore the tab node is often "inventory" (not necessarily "inventory/index").
	if (n === "inventory" || n === "inventory/index") return "inventory";

	// POS + Settings are index route tab nodes.
	if (n === "pos" || n === "pos/index") return "pos";
	if (n === "settings" || n === "settings/index") return "settings";

	// Fallback for grouped route names (e.g. "(tabs)/settings" or ".../settings/index").
	const parts = n.split("/").filter(Boolean);
	if (parts.length === 0) return null;

	const last = parts[parts.length - 1];
	const candidate = last === "index" || last === "_layout" ? parts[parts.length - 2] : last;
	if (candidate && CANONICAL_SET.has(candidate as CanonicalTab)) {
		return candidate as CanonicalTab;
	}

	return null;
}

function isIndexRouteName(name: string): boolean {
	const n = (name ?? "").toLowerCase().trim();
	return n.endsWith("/index");
}

function isSegmentRootName(name: string): boolean {
	const n = (name ?? "").toLowerCase().trim();
	return n === "home" || n === "inventory" || n === "pos" || n === "settings";
}

function isSettingsRootPath(pathname: string): boolean {
	const p = String(pathname ?? "")
		.toLowerCase()
		.trim()
		.replace(/\/+$/g, "");
	return (
		p === "/settings" ||
		p === "/settings/index" ||
		p === "/(app)/(tabs)/settings" ||
		p === "/(app)/(tabs)/settings/index"
	);
}

/**
 * Darken a hex color by mixing it with black.
 * amount: 0..1 (higher = darker)
 */
function darkenHex(hexColor: string, amount: number): string {
	const hex = (hexColor ?? "").replace("#", "").trim();
	if (hex.length !== 6) return hexColor;

	const a = Math.max(0, Math.min(1, amount));
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);

	const nr = Math.round(r * (1 - a));
	const ng = Math.round(g * (1 - a));
	const nb = Math.round(b * (1 - a));

	return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

export function BAIBottomTabBar(props: BottomTabBarProps) {
	const { state, descriptors, navigation } = props;
	const { routes, index: tabIndex } = state;
	const pathname = usePathname();
	const router = useRouter();

	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const { width, height } = useWindowDimensions();

	const isTablet = Math.min(width, height) >= 600;

	/**
	 * Compact pill governance (phone-style).
	 * - Phone: 420
	 * - Tablet: slightly wider, but still compact and centered (NOT a full-width dock)
	 */
	const maxWidth = isTablet ? 520 : 420;

	const bottom = Math.max(insets.bottom, 12);

	const pillBg = theme.colors.surface;
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;

	const activeBase =
		theme.colors.surfaceVariant ??
		theme.colors.primaryContainer ??
		theme.colors.secondaryContainer ??
		theme.colors.primary;

	const activeBubbleBg = darkenHex(activeBase, theme.dark ? 0.06 : 0.1);

	const iconIdle = theme.colors.onSurfaceVariant;
	const iconActive = theme.colors.onSurface;
	const labelIdle = theme.colors.onSurfaceVariant;
	const labelActive = theme.colors.onSurface;

	const wrapperStyle = useMemo(() => [styles.wrapper, { left: 14, right: 14, bottom }], [bottom]);

	const pillStyle = useMemo(
		() => [styles.pill, { maxWidth, backgroundColor: pillBg, borderColor }],
		[maxWidth, pillBg, borderColor],
	);

	/**
	 * Build a map from CanonicalTab -> route object.
	 * Preference order:
	 * 1) "/index" route if available
	 * 2) else segment root ("inventory") for folder-stack tabs
	 */
	const routeByCanonical = useMemo(() => {
		const map = new Map<CanonicalTab, (typeof routes)[number]>();
		const activeRouteKey = routes[tabIndex]?.key;

		for (const r of routes) {
			const key = toCanonical(r.name);
			if (!key) continue;

			// Keep the currently selected tab route as the canonical pick when available.
			if (r.key === activeRouteKey) {
				map.set(key, r);
				continue;
			}

			const existing = map.get(key);
			if (!existing) {
				map.set(key, r);
				continue;
			}
			if (existing.key === activeRouteKey) continue;

			const existingIsIndex = isIndexRouteName(existing.name);
			const currentIsIndex = isIndexRouteName(r.name);

			// Prefer index routes when present (home/index, pos/index, settings/index)
			if (!existingIsIndex && currentIsIndex) {
				map.set(key, r);
				continue;
			}

			// If neither is index, prefer a clean segment root (inventory)
			const existingIsRoot = isSegmentRootName(existing.name);
			const currentIsRoot = isSegmentRootName(r.name);
			if (!existingIsRoot && currentIsRoot) {
				map.set(key, r);
			}
		}

		if (__DEV__) {
			for (const key of TAB_ORDER) {
				const picked = map.get(key);
				if (!picked) continue;

				// Never allow device-variant nodes as tab roots
				const lowered = (picked.name ?? "").toLowerCase();
				if (lowered.includes(".phone") || lowered.includes(".tablet")) {
					console.warn(
						`[NAV_GUARD] Tab root for "${key}" resolved to device-variant route "${picked.name}". Tab roots must be segment/index routes.`,
					);
				}
			}
		}

		return map;
	}, [routes, tabIndex]);

	/**
	 * Determine the focused canonical tab in a way that is stable across:
	 * - segment roots ("pos")
	 * - index nodes ("pos/index")
	 * - nested stacks under a tab
	 */
	const focusedCanonical = useMemo(() => {
		const focused = routes[tabIndex];
		return focused ? toCanonical(focused.name) : null;
	}, [routes, tabIndex]);

	const focusedTabRouteKey = useMemo<string | null>(() => {
		if (!focusedCanonical) return null;
		const tabRoot = routeByCanonical.get(focusedCanonical);
		return tabRoot?.key ?? null;
	}, [focusedCanonical, routeByCanonical]);

	const onTabPress = (route: (typeof routes)[number], canonical: CanonicalTab) => {
		if (canonical === "settings") {
			if (isSettingsRootPath(pathname)) return;
			// Governance: bypass default tabPress behavior to avoid intermediate stack reveals/flicker.
			router.replace("/(app)/(tabs)/settings" as any);
			return;
		}

		const isTabFocused = route.key === focusedTabRouteKey || focusedCanonical === canonical;
		if (isTabFocused) return;

		const event = navigation.emit({
			type: "tabPress",
			target: route.key,
			canPreventDefault: true,
		});

		if (event.defaultPrevented) return;

		navigation.navigate(route.name as never);
	};

	return (
		<View pointerEvents='box-none' style={wrapperStyle}>
			<View style={pillStyle}>
				<View style={styles.row}>
					{TAB_ORDER.map((key) => {
						const route = routeByCanonical.get(key);

						// Maintain stable spacing even if a route is temporarily absent
						if (!route) return <View key={key} style={styles.item} />;

						// Critical: focus is derived from the chosen tab root route, not raw route names
						const baseFocused = route.key === focusedTabRouteKey || focusedCanonical === key;
						const isFocused = baseFocused;
						const settingsRoot = key === "settings" && isSettingsRootPath(pathname);
						const isPressDisabled = key === "settings" ? isFocused && settingsRoot : isFocused;

						const { options } = descriptors[route.key];

						return (
							<Pressable
								key={route.key}
								onPress={() => onTabPress(route, key)}
								disabled={isPressDisabled}
								accessibilityRole='button'
								accessibilityState={isFocused ? { selected: true, disabled: isPressDisabled } : {}}
								accessibilityLabel={options.tabBarAccessibilityLabel ?? LABELS[key]}
								style={styles.item}
								hitSlop={8}
							>
								<View
									style={[
										styles.bubble,
										{
											backgroundColor: isFocused ? activeBubbleBg : "transparent",
											borderColor: isFocused ? borderColor : "transparent",
										},
									]}
								>
									<MaterialCommunityIcons name={ICONS[key]} size={26} color={isFocused ? iconActive : iconIdle} />

									<BAIText
										variant='caption'
										style={[styles.label, { color: isFocused ? labelActive : labelIdle }]}
										numberOfLines={1}
									>
										{LABELS[key]}
									</BAIText>
								</View>
							</Pressable>
						);
					})}
				</View>
			</View>
		</View>
	);
}

/* =========================
   Styles
   ========================= */

const styles = StyleSheet.create({
	wrapper: {
		position: "absolute",
		alignItems: "center",
	},

	pill: {
		width: "100%",
		height: PILL_HEIGHT,
		borderRadius: PILL_RADIUS,
		borderWidth: StyleSheet.hairlineWidth,

		// Equal inset on all sides (top/bottom == left/right).
		padding: INSET,

		justifyContent: "center",

		shadowColor: "#000",
		shadowOpacity: 0.07,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 6 },
		elevation: 3,
	},

	row: {
		flexDirection: "row",
		alignItems: "center",
		height: "100%",

		// Equal inter-tab spacing matching the pill inset.
		gap: INSET,
	},

	item: {
		flex: 1,
		alignItems: "stretch",
		justifyContent: "center",
	},

	bubble: {
		flex: 1, // stable widths; no active-width mutation
		height: "100%",
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		borderWidth: StyleSheet.hairlineWidth,
	},

	label: {
		fontSize: 9,
		lineHeight: 10,
	},
});
