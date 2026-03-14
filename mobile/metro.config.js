const path = require("path");
const { resolve } = require("metro-resolver");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const keepAwakeShimPath = path.resolve(__dirname, "shims/expo-keep-awake/index.js");
const metroBlockList = Array.isArray(config.resolver.blockList)
	? config.resolver.blockList
	: config.resolver.blockList
		? [config.resolver.blockList]
		: [];

config.resolver.blockList = [
	...metroBlockList,
	/\/\.expo\/.*$/,
	/\/android\/build\/.*$/,
	/\/android\/app\/build\/.*$/,
	/\/android\/\.gradle\/.*$/,
	/\/ios\/build\/.*$/,
	/\/ios\/Pods\/.*$/,
];

config.resolver.extraNodeModules = {
	...(config.resolver.extraNodeModules || {}),
	"expo-keep-awake": keepAwakeShimPath,
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === "expo-keep-awake") {
		return {
			filePath: keepAwakeShimPath,
			type: "sourceFile",
		};
	}

	return resolve(context, moduleName, platform);
};

module.exports = config;
