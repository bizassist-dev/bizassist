// BizAssist_mobile
// path: app/_layout.tsx

import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef } from "react";
import { LogBox, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTheme } from "react-native-paper";

import { useAppBackground } from "@/lib/theme/appBackground";
import { AuthProvider, useAuth } from "@/modules/auth/AuthContext";
import { clearSessionScopedClientState } from "@/modules/auth/auth.sessionBoundary";
import { RealtimeInvalidationBridge } from "@/modules/realtime/RealtimeInvalidationBridge";
import { BAIAppProviders } from "@/providers/BAIAppProviders";

// Keep native splash visible until the first React view is actually laid out.
SplashScreen.preventAutoHideAsync().catch(() => {
	// no-op
});

if (__DEV__) {
	LogBox.ignoreLogs([
		"Sending `onAnimatedValueUpdate` with no listeners registered.",
		"Sending `onAnimatedValueUpdate` with no listeners registered",
		"onAnimatedValueUpdate",
	]);
}

function RootShell() {
	// Must be called under BAIAppProviders so it reflects the resolved theme (System | Light | Dark)
	const bg = useAppBackground();
	const theme = useTheme();

	const router = useRouter();
	const segments = useSegments();
	const { user, isAuthenticated, isBootstrapping } = useAuth();
	const authUserId = typeof user?.id === "string" ? user.id.trim() : "";
	const sessionBoundaryKey = authUserId || "guest";
	const previousAuthUserIdRef = useRef<string | null | undefined>(undefined);

	useEffect(() => {
		if (isBootstrapping) return;

		const nextAuthUserId = authUserId || null;
		const previousAuthUserId = previousAuthUserIdRef.current;
		previousAuthUserIdRef.current = nextAuthUserId;

		if (previousAuthUserId === undefined || previousAuthUserId !== nextAuthUserId) {
			clearSessionScopedClientState();
		}
	}, [authUserId, isBootstrapping]);

	// Hard eviction guard: unauthenticated users must never remain in (app)
	useEffect(() => {
		if (isBootstrapping) return;

		const top = segments?.[0];
		const inAppGroup = top === "(app)";

		// Typed-routes: auth index route is folder path (/(auth)), not (/(auth)/index).
		if (!isAuthenticated && inAppGroup) {
			router.replace("/(auth)");
		}
	}, [isAuthenticated, isBootstrapping, router, segments]);

	// Hide splash exactly once, after the first root layout.
	const didHideRef = useRef(false);

	const onRootLayout = useCallback(() => {
		if (didHideRef.current) return;
		didHideRef.current = true;

		SplashScreen.hideAsync().catch(() => {
			// Non-fatal: never block startup for splash issues.
		});
	}, []);

	return (
		<View style={{ flex: 1, backgroundColor: bg }} onLayout={onRootLayout}>
			<StatusBar
				style={theme.dark ? "light" : "dark"}
				translucent={false}
				{...(Platform.OS === "android" ? { backgroundColor: bg } : null)}
			/>
			{isAuthenticated ? <RealtimeInvalidationBridge /> : null}

			<Stack
				key={sessionBoundaryKey}
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: bg },
				}}
			>
				<Stack.Screen name='(system)' options={{ headerShown: false }} />
				<Stack.Screen name='(auth)' options={{ headerShown: false }} />
				<Stack.Screen name='(app)' options={{ headerShown: false }} />
			</Stack>
		</View>
	);
}

export default function RootLayout() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<BAIAppProviders>
				<AuthProvider>
					<RootShell />
				</AuthProvider>
			</BAIAppProviders>
		</GestureHandlerRootView>
	);
}
