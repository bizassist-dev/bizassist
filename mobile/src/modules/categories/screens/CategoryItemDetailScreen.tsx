import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "react-native-paper";

import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { useActiveBusinessMeta } from "@/modules/business/useActiveBusinessMeta";
import { inventoryApi } from "@/modules/inventory/inventory.api";
import type { InventoryProductDetail } from "@/modules/inventory/inventory.types";
import { formatMoney } from "@/shared/money/money.format";

const DETAIL_MAX_WIDTH = 860;

function extractApiErrorMessage(err: unknown): string {
	const data = (err as any)?.response?.data;
	const msg = data?.message ?? data?.error?.message ?? (err as any)?.message ?? "Operation failed.";
	return String(msg);
}

function formatProductType(type: InventoryProductDetail["type"] | undefined): string {
	return type === "SERVICE" ? "Service" : "Item";
}

function hasMeaningfulText(value: unknown): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function formatOnHand(product: InventoryProductDetail): string {
	if (!product.trackInventory) return "Not tracked";
	const raw =
		typeof product.onHandCachedRaw === "string" && product.onHandCachedRaw.trim().length > 0
			? product.onHandCachedRaw.trim()
			: Number.isFinite(product.onHandCached)
				? String(product.onHandCached)
				: "0";
	const unitLabel =
		(typeof product.unitAbbreviation === "string" && product.unitAbbreviation.trim()) ||
		(typeof product.unitName === "string" && product.unitName.trim()) ||
		"";
	return unitLabel ? `${raw} ${unitLabel}` : raw;
}

export function CategoryItemDetailScreen({ mode }: { mode: "inventory" | "settings" }) {
	const router = useRouter();
	const theme = useTheme();
	const tabBarHeight = useBottomTabBarHeight();
	const { currencyCode } = useActiveBusinessMeta();

	const params = useLocalSearchParams<{ id?: string; itemId?: string }>();
	const categoryId = String(params.id ?? "").trim();
	const itemId = String(params.itemId ?? "").trim();

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

	const query = useQuery<InventoryProductDetail>({
		queryKey: ["inventory", "product-detail", "category-scope", itemId] as const,
		queryFn: () => inventoryApi.getProductDetail(itemId),
		enabled: itemId.length > 0,
		staleTime: 30_000,
	});

	const product = query.data ?? null;
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const categoryRouteBase =
		mode === "settings" ? "/(app)/(tabs)/settings/categories" : "/(app)/(tabs)/inventory/categories";

	const onBack = useCallback(() => {
		if (!lockNav()) return;
		if (router.canGoBack?.()) {
			router.back();
			return;
		}
		router.replace(`${categoryRouteBase}/${encodeURIComponent(categoryId)}` as any);
	}, [categoryId, categoryRouteBase, lockNav, router]);

	const onRetry = useCallback(() => {
		if (!itemId) return;
		query.refetch();
	}, [itemId, query]);

	const detailRows = useMemo(() => {
		if (!product) return [];

		const rows: Array<{ label: string; value: string | ReactNode }> = [
			{ label: "Type", value: formatProductType(product.type) },
			{ label: "Status", value: product.isActive === false ? "Archived" : "Active" },
			{ label: "On Hand", value: formatOnHand(product) },
			{
				label: "Category",
				value: typeof product.category?.name === "string" && product.category.name.trim().length > 0 ? product.category.name : "None",
			},
		];

		if (hasMeaningfulText(product.sku)) {
			rows.push({ label: "SKU", value: String(product.sku).trim() });
		}

		if (hasMeaningfulText(product.barcode)) {
			rows.push({ label: "Barcode", value: String(product.barcode).trim() });
		}

		if (product.price !== null && product.price !== undefined) {
			rows.push({ label: "Price", value: formatMoney({ currencyCode, amount: product.price }) });
		}

		if (product.cost !== null && product.cost !== undefined) {
			rows.push({ label: "Cost", value: formatMoney({ currencyCode, amount: product.cost }) });
		}

		if (hasMeaningfulText(product.description)) {
			rows.push({ label: "Description", value: String(product.description).trim() });
		}

		return rows;
	}, [currencyCode, product]);

	return (
		<BAIScreen
			padded={false}
			safeTop={false}
			safeBottom={false}
			scroll
			style={styles.root}
			contentContainerStyle={styles.scrollContent}
			scrollProps={{ showsVerticalScrollIndicator: false }}
		>
			<BAIHeader title='Item Details' variant='back' onLeftPress={onBack} disabled={isNavLocked} />
			<View style={[styles.screen, { backgroundColor: theme.colors.background, paddingBottom: tabBarHeight + 14 }]}>
				<View style={styles.centerWrap}>
					<View style={[styles.column, { maxWidth: DETAIL_MAX_WIDTH }]}>
						{query.isLoading ? (
							<BAISurface style={[styles.stateCard, { borderColor }]} padded bordered>
								<View style={styles.stateBlock}>
									<BAIActivityIndicator />
									<BAIText variant='caption' muted style={styles.stateMessage}>
										Loading item details...
									</BAIText>
								</View>
							</BAISurface>
						) : query.isError ? (
							<BAISurface style={[styles.stateCard, { borderColor }]} padded bordered>
								<View style={styles.stateBlock}>
									<BAIText variant='caption' muted style={styles.stateMessage}>
										{extractApiErrorMessage(query.error)}
									</BAIText>
									<BAIRetryButton onPress={onRetry} disabled={!itemId}>
										Retry
									</BAIRetryButton>
								</View>
							</BAISurface>
						) : !product ? (
							<BAISurface style={[styles.stateCard, { borderColor }]} padded bordered>
								<View style={styles.stateBlock}>
									<BAIText variant='caption' muted style={styles.stateMessage}>
										Item not found.
									</BAIText>
									<BAIButton mode='outlined' onPress={onBack} disabled={isNavLocked} shape='pill' widthPreset='standard'>
										Back
									</BAIButton>
								</View>
							</BAISurface>
							) : (
								<BAISurface style={[styles.contentCard, { borderColor }]} padded bordered>
									<View style={styles.headerBlock}>
										<BAIText variant='subtitle' numberOfLines={1} style={styles.titleText}>
											{product.name}
										</BAIText>
									</View>

								<View style={[styles.divider, { backgroundColor: borderColor }]} />

								<View style={styles.detailRows}>
									{detailRows.map((row, index) => (
										<View key={`${row.label}-${index}`}>
											<View style={styles.detailRow}>
												<BAIText variant='caption' muted style={styles.detailLabel}>
													{row.label}
												</BAIText>
												<View style={styles.detailValueWrap}>
													{typeof row.value === "string" ? (
														<BAIText variant='body' style={styles.detailValueText}>
															{row.value}
														</BAIText>
													) : (
														row.value
													)}
												</View>
											</View>
											{index < detailRows.length - 1 ? (
												<View style={[styles.metaDivider, { backgroundColor: borderColor }]} />
											) : null}
										</View>
									))}
								</View>
							</BAISurface>
						)}
					</View>
				</View>
			</View>
		</BAIScreen>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	scrollContent: {
		paddingBottom: 8,
	},
	screen: {
		paddingHorizontal: 12,
		paddingTop: 12,
	},
	centerWrap: {
		flex: 1,
		alignItems: "center",
	},
	column: {
		width: "100%",
	},
	stateCard: {
		borderRadius: 16,
		marginBottom: 0,
	},
	stateBlock: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 24,
		gap: 12,
	},
	stateMessage: {
		textAlign: "center",
	},
	contentCard: {
		borderRadius: 16,
		marginBottom: 0,
		gap: 12,
	},
	headerBlock: {
		gap: 4,
	},
	titleText: {
		fontSize: 32,
		lineHeight: 38,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
	},
	detailRows: {
		gap: 0,
	},
	detailRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 10,
	},
	detailLabel: {
		width: 92,
	},
	detailValueWrap: {
		flex: 1,
	},
	detailValueText: {
		fontWeight: "600",
	},
	metaDivider: {
		height: StyleSheet.hairlineWidth,
	},
});
