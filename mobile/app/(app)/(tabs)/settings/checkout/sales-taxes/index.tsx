import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useTheme } from "react-native-paper";

import { BAIHeader } from "@/components/ui/BAIHeader";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { useAuth } from "@/modules/auth/AuthContext";
import { getUserAvatarInitials } from "@/modules/auth/auth.user";
import { useSalesTaxDraft, useSalesTaxesList } from "@/modules/taxes/taxes.queries";

function TaxRow({
	name,
	percentage,
	archivedAt,
	enabled,
	onPress,
}: {
	name: string;
	percentage: number;
	archivedAt: string | null;
	enabled: boolean;
	onPress: () => void;
}) {
	const theme = useTheme();
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const surfaceAlt = theme.colors.surfaceVariant ?? theme.colors.surface;
	const statusLabel = archivedAt ? "Archived" : enabled ? "Enabled" : "Disabled";
	const statusBg = archivedAt
		? (theme.colors.errorContainer ?? surfaceAlt)
		: enabled
			? (theme.colors.primaryContainer ?? surfaceAlt)
			: surfaceAlt;
	const statusColor = archivedAt
		? (theme.colors.onErrorContainer ?? theme.colors.onSurface)
		: enabled
			? (theme.colors.onPrimaryContainer ?? theme.colors.onSurface)
			: (theme.colors.onSurfaceVariant ?? theme.colors.onSurface);

	return (
		<Pressable onPress={onPress}>
			{({ pressed }) => (
				<BAISurface
					bordered
					padded
					style={[
						styles.taxRowCard,
						{ borderColor, backgroundColor: surfaceAlt },
						pressed ? styles.taxRowPressed : null,
					]}
				>
					<View style={styles.taxRowLeft}>
						<BAIText variant='subtitle' numberOfLines={1}>
							{name}
						</BAIText>
						<BAIText variant='caption' muted>
							{percentage}%
						</BAIText>
					</View>

					<View style={styles.taxRowRight}>
						<View style={[styles.statusPill, { backgroundColor: statusBg, borderColor }]}>
							<BAIText variant='caption' style={{ color: statusColor }}>
								{statusLabel}
							</BAIText>
						</View>
						<MaterialCommunityIcons
							name='chevron-right'
							size={22}
							color={theme.colors.onSurfaceVariant ?? theme.colors.onSurface}
						/>
					</View>
				</BAISurface>
			)}
		</Pressable>
	);
}

export default function SalesTaxesIndexScreen() {
	const router = useRouter();
	const theme = useTheme();
	const { user } = useAuth();
	const tabBarHeight = useBottomTabBarHeight();
	const listQuery = useSalesTaxesList({ includeArchived: true });
	const { resetDraft } = useSalesTaxDraft();
	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const surfaceAlt = theme.colors.surfaceVariant ?? theme.colors.surface;
	const createButtonVariant = "solid";
	const createButtonIntent = "primary";
	const surfaceInteractive = useMemo(
		() => ({
			borderColor,
			backgroundColor: surfaceAlt,
		}),
		[borderColor, surfaceAlt],
	);
	const userAvatarInitials = useMemo(() => getUserAvatarInitials(user), [user]);

	const onBack = useCallback(() => {
		if (router.canGoBack?.()) {
			router.back();
			return;
		}
		router.replace("/(app)/(tabs)/settings/checkout" as any);
	}, [router]);

	const onCreate = useCallback(() => {
		resetDraft();
		router.push("/(app)/(tabs)/settings/checkout/sales-taxes/create" as any);
	}, [resetDraft, router]);

	const onOpenTax = useCallback(
		(taxId: string) => {
			router.push({
				pathname: "/(app)/(tabs)/settings/checkout/sales-taxes/create" as any,
				params: { taxId },
			});
		},
		[router],
	);

	const items = listQuery.data?.items ?? [];

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<BAIScreen tabbed padded={false} safeTop={false} safeBottom={false}>
				<BAIHeader
					title='Sales taxes'
					variant='back'
					onLeftPress={onBack}
					rightRailWidth={118}
					rightSlot={({ disabled }) => (
						<View style={styles.headerActions}>
							<Pressable
								onPress={onCreate}
								disabled={disabled}
								accessibilityRole='button'
								accessibilityLabel='Create sales tax'
								hitSlop={8}
								style={({ pressed }) => [
									styles.addCircle,
									{ backgroundColor: theme.colors.primary, opacity: disabled ? 0.5 : 1 },
									pressed && !disabled ? styles.headerActionPressed : null,
								]}
							>
								<MaterialCommunityIcons name='plus' size={30} color={theme.colors.onPrimary} />
							</Pressable>
							<View
								style={[
									styles.headerAvatar,
									{
										borderColor: theme.colors.outlineVariant ?? theme.colors.outline,
										backgroundColor: theme.colors.surfaceVariant ?? theme.colors.surface,
									},
								]}
							>
								<BAIText variant='subtitle' style={styles.headerAvatarText}>
									{userAvatarInitials}
								</BAIText>
							</View>
						</View>
					)}
				/>

				<View style={[styles.screen, { paddingBottom: tabBarHeight + 8 }]}>
					<BAISurface bordered padded style={[styles.mainCard, surfaceInteractive]}>
						{listQuery.isLoading ? (
							<BAIText variant='body' style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
								Loading taxes...
							</BAIText>
						) : items.length === 0 ? (
							<>
								<BAIButton
									variant={createButtonVariant}
									intent={createButtonIntent}
									size='lg'
									onPress={onCreate}
									shape='default'
								>
									Create tax
								</BAIButton>
								<BAIText variant='body' style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
									Sales taxes will be automatically calculated at purchase.
								</BAIText>
							</>
						) : (
							<View style={styles.listCard}>
								{items.map((tax) => (
									<TaxRow
										key={tax.id}
										name={tax.name}
										percentage={tax.percentage}
										archivedAt={tax.archivedAt}
										enabled={tax.enabled}
										onPress={() => onOpenTax(tax.id)}
									/>
								))}
							</View>
						)}
					</BAISurface>
				</View>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		padding: 12,
		paddingTop: 0,
		gap: 12,
	},
	headerActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	headerActionPressed: {
		opacity: 0.78,
	},
	headerAvatar: {
		width: 50,
		height: 50,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
	},
	headerAvatarText: {
		fontWeight: "700",
		letterSpacing: 0.2,
	},
	addCircle: {
		width: 50,
		height: 50,
		borderRadius: 25,
		alignItems: "center",
		justifyContent: "center",
	},
	mainCard: {
		flex: 1,
		borderRadius: 16,
		gap: 12,
	},
	infoText: {
		textAlign: "center",
		paddingHorizontal: 24,
	},
	listCard: {
		gap: 10,
	},
	taxRowCard: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		borderRadius: 12,
	},
	taxRowPressed: {
		opacity: 0.88,
	},
	taxRowLeft: {
		gap: 2,
		flex: 1,
		minWidth: 0,
	},
	taxRowRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	statusPill: {
		borderWidth: 1,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
	},
});
