// app.config.ts
import type { ExpoConfig, ConfigContext } from "expo/config";

const appEnvRaw = String(process.env.EXPO_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "development")
	.trim()
	.toLowerCase();
const isProd = appEnvRaw === "production" || appEnvRaw === "prod";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? "http://10.0.2.2:4000/api/v1";

export default ({ config }: ConfigContext): ExpoConfig => ({
	...config,

	name: "mobile",
	slug: "mobile",
	version: "1.0.0",
	scheme: "mobile",

	orientation: "default",
	newArchEnabled: true,

	icon: "./assets/images/icon.png",
	backgroundColor: "#202124",

	extra: {
		API_BASE_URL,
		APP_ENV: appEnvRaw,
		EXPO_PUBLIC_APP_ENV: appEnvRaw,
		...(config.extra ?? {}),
	},

	ios: {
		bundleIdentifier: "com.gerardogaden.bizassist",
		supportsTablet: true,
		infoPlist: {
			NSLocalNetworkUsageDescription:
				"Allow BizAssist to connect to your local development server while running the app in development.",
			UIViewControllerBasedStatusBarAppearance: false,
			UISupportedInterfaceOrientations: ["UIInterfaceOrientationPortrait"],
			"UISupportedInterfaceOrientations~ipad": [
				"UIInterfaceOrientationPortrait",
				"UIInterfaceOrientationPortraitUpsideDown",
				"UIInterfaceOrientationLandscapeLeft",
				"UIInterfaceOrientationLandscapeRight",
			],
		},
	},

	android: {
		package: "com.gerardogaden.bizassist",
		// NOTE: usesCleartextTraffic is valid in app.json/app.config, but TS types sometimes lag.
		// If TS complains, either cast android as any (shown below) or update @expo/config-types.
		...({
			usesCleartextTraffic: !isProd,
		} as any),

		edgeToEdgeEnabled: true,
		predictiveBackGestureEnabled: false,

		adaptiveIcon: {
			backgroundColor: "#202124",
			foregroundImage: "./assets/images/android-icon-foreground.png",
			backgroundImage: "./assets/images/android-icon-background.png",
			monochromeImage: "./assets/images/android-icon-monochrome.png",
		},
	},

	web: {
		output: "static",
		favicon: "./assets/images/favicon.png",
	},

	plugins: [
		"expo-router",
		"expo-font",
		[
			"expo-image-picker",
			{
				photosPermission: "Allow BizAssist to access your photos to upload item images.",
				cameraPermission: "Allow BizAssist to use your camera to capture item photos.",
			},
		],
		[
			"expo-media-library",
			{
				photosPermission: "Allow BizAssist to access your photos to select POS tile images.",
			},
		],

		[
			"expo-build-properties",
			{
				ios: { deploymentTarget: "16.0" },
			},
		],

		[
			"expo-splash-screen",
			{
				image: "./assets/images/splash-icon.png",
				imageWidth: 200,
				resizeMode: "contain",
				backgroundColor: "#202124",
				dark: {
					image: "./assets/images/splash-icon.png",
					backgroundColor: "#202124",
				},
			},
		],
	],

	experiments: {
		typedRoutes: true,
		reactCompiler: true,
	},
});
