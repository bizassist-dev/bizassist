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
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
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

const DOCK_HEIGHT = 60;
const DOCK_RADIUS = 999;
const SCAN_BUTTON_SIZE = 56;

const INSET = 6;
const DOCK_ITEM_GAP = 2;
const CLUSTER_GAP = 8;
const OUTER_HORIZONTAL_MARGIN = 10;

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

function isInventoryScanPath(pathname: string): boolean {
	const p = String(pathname ?? "")
		.toLowerCase()
		.trim()
		.replace(/\/+$/g, "");
	return (
		p === "/inventory/scan" ||
		p === "/(app)/(tabs)/inventory/scan" ||
		p === "/pos/scan" ||
		p === "/(app)/(tabs)/pos/scan"
	);
}

function isPosPath(pathname: string): boolean {
	const p = String(pathname ?? "")
		.toLowerCase()
		.trim()
		.replace(/\/+$/g, "");
	return p === "/pos" || p.startsWith("/pos/") || p === "/(app)/(tabs)/pos" || p.startsWith("/(app)/(tabs)/pos/");
}

function toReturnToPath(pathname: string, params: Record<string, unknown>): string {
	const base = String(pathname ?? "").trim();
	if (!base.startsWith("/")) return "/(app)/(tabs)/inventory";

	const query = new URLSearchParams();
	for (const [key, raw] of Object.entries(params ?? {})) {
		if (!key) continue;
		if (key === "scannedBarcode" || key === "q" || key === "returnTo") continue;

		if (Array.isArray(raw)) {
			for (const v of raw) {
				if (typeof v === "string" && v.trim()) query.append(key, v);
			}
			continue;
		}

		if (typeof raw === "string" && raw.trim()) {
			query.append(key, raw);
		}
	}

	const qs = query.toString();
	return qs ? `${base}?${qs}` : base;
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

function applyAlpha(color: string, alpha: number): string {
	const a = Math.max(0, Math.min(1, alpha));
	const normalized = String(color ?? "").trim();
	if (!normalized) return `rgba(0,0,0,${a})`;

	if (normalized.startsWith("#")) {
		const hex = normalized.slice(1);
		const isShort = hex.length === 3;
		const isLong = hex.length === 6;
		if (!isShort && !isLong) return normalized;
		const full = isShort
			? hex
					.split("")
					.map((ch) => `${ch}${ch}`)
					.join("")
			: hex;
		const r = parseInt(full.slice(0, 2), 16);
		const g = parseInt(full.slice(2, 4), 16);
		const b = parseInt(full.slice(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${a})`;
	}

	const rgbMatch = normalized.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
	if (rgbMatch) {
		const r = Number(rgbMatch[1]);
		const g = Number(rgbMatch[2]);
		const b = Number(rgbMatch[3]);
		return `rgba(${r}, ${g}, ${b}, ${a})`;
	}

	return normalized;
}

export function BAIBottomTabBar(props: BottomTabBarProps) {
	const { state, descriptors, navigation } = props;
	const { routes, index: tabIndex } = state;
	const pathname = usePathname();
	const currentParams = useLocalSearchParams();
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
	const maxWidth = isTablet ? 480 : 372;

	const bottom = Math.max(insets.bottom, 12);

	const outlineBase = theme.colors.outlineVariant ?? theme.colors.outline;
	const dockBg = applyAlpha(theme.colors.surface, theme.dark ? 0.93 : 0.97);
	const containerBorderColor = applyAlpha(outlineBase, theme.dark ? 0.78 : 0.48);
	const activeBorderColor = applyAlpha(outlineBase, theme.dark ? 0.34 : 0.14);

	const activeBubbleBg = applyAlpha(theme.colors.onSurface, theme.dark ? 0.14 : 0.08);

	const scanButtonBg = applyAlpha(theme.colors.surface, theme.dark ? 0.96 : 0.99);
	const scanButtonBorderColor = applyAlpha(outlineBase, theme.dark ? 0.82 : 0.56);

	const iconIdle = theme.colors.onSurfaceVariant;
	const iconActive = theme.colors.primary;
	const labelIdle = theme.colors.onSurfaceVariant;
	const labelActive = theme.colors.primary;

	const wrapperStyle = useMemo(
		() => [styles.wrapper, { left: OUTER_HORIZONTAL_MARGIN, right: OUTER_HORIZONTAL_MARGIN, bottom }],
		[bottom],
	);

	const dockStyle = useMemo(
		() => [styles.dock, { maxWidth, backgroundColor: dockBg, borderColor: containerBorderColor }],
		[maxWidth, dockBg, containerBorderColor],
	);

	const scanButtonStyle = useMemo(
		() => [styles.scanButton, { backgroundColor: scanButtonBg, borderColor: scanButtonBorderColor }],
		[scanButtonBg, scanButtonBorderColor],
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

	const isScanOpen = isInventoryScanPath(pathname);
	const scanIconColor = iconIdle;
	const returnToPath = useMemo(
		() => toReturnToPath(pathname, currentParams as Record<string, unknown>),
		[currentParams, pathname],
	);
	const currentDraftId = useMemo(() => {
		const raw = (currentParams as any)?.draftId;
		if (typeof raw !== "string") return "";
		return raw.trim();
	}, [currentParams]);

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

	const onScanPress = () => {
		if (isScanOpen) return;
		const originWorkspace = isPosPath(pathname) ? "pos" : "inventory";
		const scanPathname = isPosPath(pathname) ? "/(app)/(tabs)/pos/scan" : "/(app)/(tabs)/inventory/scan";
		router.push({
			pathname: scanPathname as any,
			params: {
				scanIntent: "universal",
				scanOriginWorkspace: originWorkspace,
				returnTo: returnToPath,
				...(currentDraftId ? { draftId: currentDraftId } : {}),
			},
		} as any);
	};

	return (
		<View pointerEvents='box-none' style={wrapperStyle}>
			<View style={styles.cluster}>
				<View style={dockStyle}>
					<View style={styles.row}>
						{TAB_ORDER.map((key) => {
							const route = routeByCanonical.get(key);

							if (!route) return <View key={key} style={styles.item} />;

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
												borderColor: isFocused ? activeBorderColor : "transparent",
											},
										]}
									>
										<MaterialCommunityIcons name={ICONS[key]} size={24} color={isFocused ? iconActive : iconIdle} />

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

				<Pressable
					onPress={onScanPress}
					disabled={isScanOpen}
					accessibilityRole='button'
					accessibilityState={isScanOpen ? { selected: true, disabled: true } : {}}
					accessibilityLabel='Scan barcode'
					style={scanButtonStyle}
					hitSlop={8}
				>
					<MaterialCommunityIcons name='barcode-scan' size={28} color={scanIconColor} />
				</Pressable>
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

	cluster: {
		width: "100%",
		maxWidth: 480 + SCAN_BUTTON_SIZE + CLUSTER_GAP,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: CLUSTER_GAP,
	},

	dock: {
		flex: 1,
		height: DOCK_HEIGHT,
		borderRadius: DOCK_RADIUS,
		borderWidth: StyleSheet.hairlineWidth,
		padding: INSET,
		justifyContent: "center",

		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 14,
		shadowOffset: { width: 0, height: 6 },
		elevation: 3,
	},

	row: {
		flexDirection: "row",
		alignItems: "center",
		height: "100%",
		gap: DOCK_ITEM_GAP,
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
		gap: 2,
		paddingHorizontal: 4,
		paddingVertical: 4,
		borderWidth: StyleSheet.hairlineWidth,
	},

	scanButton: {
		width: SCAN_BUTTON_SIZE,
		height: SCAN_BUTTON_SIZE,
		borderRadius: SCAN_BUTTON_SIZE / 2,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",

		shadowColor: "#000",
		shadowOpacity: 0.12,
		shadowRadius: 14,
		shadowOffset: { width: 0, height: 6 },
		elevation: 5,
	},

	label: {
		fontSize: 10,
		lineHeight: 12,
	},
});
