import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "react-native-paper";

import { ConfirmActionModal } from "@/components/settings/ConfirmActionModal";
import { BAITimeAgo } from "@/components/system/BAITimeAgo";
import { BAIButton } from "@/components/ui/BAIButton";
import { BAIScreen } from "@/components/ui/BAIScreen";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { authApi } from "@/modules/auth/auth.api";
import type { AuthDeviceSession } from "@/modules/auth/auth.types";
import { mapAuthErrorToMessage, type AuthDomainError } from "@/modules/auth/auth.errors";
import { useAppHeader } from "@/modules/navigation/useAppHeader";

const AUTH_DEVICES_QUERY_KEY = ["auth", "devices"] as const;
const SETTINGS_ROUTE = "/(app)/(tabs)/settings" as const;

function formatDeviceName(device: AuthDeviceSession): string {
	return device.deviceName?.trim() || "Mobile Device";
}

function formatAbsoluteDate(value: string): string {
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "Unknown";
	return date.toLocaleString();
}

export default function SettingsDevicesScreen() {
	const theme = useTheme();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [selectedDevice, setSelectedDevice] = useState<AuthDeviceSession | null>(null);

	const onBack = useCallback(() => {
		if (router.canGoBack?.()) {
			router.back();
			return;
		}
		router.replace(SETTINGS_ROUTE as any);
	}, [router]);

	const headerOptions = useAppHeader("detail", { title: "Devices", onBack });

	const devicesQuery = useQuery({
		queryKey: AUTH_DEVICES_QUERY_KEY,
		queryFn: () => authApi.listDevices(),
		staleTime: 30_000,
	});

	const revokeMutation = useMutation({
		mutationFn: (deviceId: string) => authApi.revokeDevice(deviceId),
		onSuccess: async () => {
			setSelectedDevice(null);
			await queryClient.invalidateQueries({ queryKey: AUTH_DEVICES_QUERY_KEY });
		},
	});

	const devicesPayload = devicesQuery.data;
	const devices = devicesPayload?.devices ?? [];
	const activeCount = devicesPayload?.activeDeviceCount ?? devices.length;
	const maxDevices = devicesPayload?.maxDevices ?? null;
	const currentDevice = useMemo(() => devices.find((device) => device.isCurrent) ?? null, [devices]);

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;
	const errorMessage = devicesQuery.error ? mapAuthErrorToMessage(devicesQuery.error as AuthDomainError) : null;
	const revokeErrorMessage = revokeMutation.error ? mapAuthErrorToMessage(revokeMutation.error as AuthDomainError) : null;

	const handleOpenRevoke = useCallback((device: AuthDeviceSession) => {
		setSelectedDevice(device);
	}, []);

	const handleDismissRevoke = useCallback(() => {
		if (revokeMutation.isPending) return;
		setSelectedDevice(null);
	}, [revokeMutation.isPending]);

	const handleConfirmRevoke = useCallback(async () => {
		if (!selectedDevice) return;
		await revokeMutation.mutateAsync(selectedDevice.deviceId);
	}, [revokeMutation, selectedDevice]);

	return (
		<>
			<Stack.Screen options={headerOptions} />
			<BAIScreen tabbed padded={false} safeTop={false}>
				<ScrollView contentContainerStyle={styles.scrollContent}>
					<View style={styles.centerWrap}>
						<View style={styles.column}>
								<BAISurface style={styles.summary} padded>
									<BAIText variant='title'>Active Devices</BAIText>
									<BAIText variant='body' muted>
										{activeCount} device{activeCount === 1 ? "" : "s"} currently signed in for this account.
									</BAIText>
									{maxDevices != null ? (
										<BAIText variant='caption' muted>
											Device limit: {activeCount} of {maxDevices} active slots in use.
										</BAIText>
									) : null}
									<BAIText variant='caption' muted>
										Remove old devices here to free space when the account hits its hard device cap.
									</BAIText>
								{currentDevice ? (
									<BAIText variant='caption' muted>
										This device: {formatDeviceName(currentDevice)}
									</BAIText>
								) : null}
							</BAISurface>

							{errorMessage ? (
								<BAISurface style={styles.notice} padded>
									<BAIText variant='body'>{errorMessage}</BAIText>
								</BAISurface>
							) : null}

							{revokeErrorMessage ? (
								<BAISurface style={styles.notice} padded>
									<BAIText variant='body'>{revokeErrorMessage}</BAIText>
								</BAISurface>
							) : null}

							{devicesQuery.isLoading ? (
								<BAISurface style={styles.deviceCard} padded>
									<BAIText variant='body'>Loading devices…</BAIText>
								</BAISurface>
							) : null}

							{!devicesQuery.isLoading && devices.length === 0 ? (
								<BAISurface style={styles.deviceCard} padded>
									<BAIText variant='body'>No active devices found.</BAIText>
								</BAISurface>
							) : null}

							{devices.map((device) => (
								<BAISurface key={device.deviceId} style={styles.deviceCard} padded bordered borderColor={borderColor}>
									<View style={styles.cardTopRow}>
										<View style={styles.deviceTitleWrap}>
											<BAIText variant='body'>{formatDeviceName(device)}</BAIText>
											<BAIText variant='caption' muted>
												{device.isCurrent ? "Current device" : `${device.sessionCount} session${device.sessionCount === 1 ? "" : "s"}`}
											</BAIText>
										</View>

										{device.isCurrent ? (
											<BAIButton intent='neutral' variant='outline' disabled>
												Current
											</BAIButton>
										) : (
											<BAIButton
												intent='danger'
												variant='outline'
												onPress={() => handleOpenRevoke(device)}
												disabled={revokeMutation.isPending}
											>
												Remove
											</BAIButton>
										)}
									</View>

									<View style={styles.metaBlock}>
										<BAIText variant='caption' muted>
											Last seen
										</BAIText>
										<BAITimeAgo value={device.lastSeenAt} variant='body' muted={false} />
									</View>

									<View style={styles.metaBlock}>
										<BAIText variant='caption' muted>
											First issued
										</BAIText>
										<BAIText variant='body'>{formatAbsoluteDate(device.firstIssuedAt)}</BAIText>
									</View>

									<View style={styles.metaBlock}>
										<BAIText variant='caption' muted>
											Expires
										</BAIText>
										<BAIText variant='body'>{formatAbsoluteDate(device.expiresAt)}</BAIText>
									</View>
								</BAISurface>
							))}
						</View>
					</View>
				</ScrollView>

				<ConfirmActionModal
					visible={!!selectedDevice}
					title='Remove device?'
					message={`This will revoke all active sessions for ${selectedDevice ? formatDeviceName(selectedDevice) : "this device"}.`}
					confirmLabel='Remove Device'
					cancelLabel='Cancel'
					confirmIntent='danger'
					onDismiss={handleDismissRevoke}
					onConfirm={handleConfirmRevoke}
					disabled={revokeMutation.isPending}
				/>
			</BAIScreen>
		</>
	);
}

const styles = StyleSheet.create({
	scrollContent: {
		paddingTop: 20,
		paddingBottom: 16,
	},
	centerWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "flex-start",
	},
	column: {
		width: "100%",
		maxWidth: 560,
		paddingHorizontal: 14,
		gap: 12,
	},
	summary: {
		borderRadius: 18,
		gap: 6,
	},
	notice: {
		borderRadius: 18,
	},
	deviceCard: {
		borderRadius: 18,
		gap: 12,
	},
	cardTopRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	deviceTitleWrap: {
		flex: 1,
		gap: 4,
	},
	metaBlock: {
		gap: 4,
	},
});
