import { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "react-native-paper";

import { BAIIconButton } from "@/components/ui/BAIIconButton";
import { BAISearchBar } from "@/components/ui/BAISearchBar";
import { FIELD_LIMITS } from "@/shared/fieldLimits";

const DEFAULT_HEIGHT = 56;
const SCAN_ICON_SIZE = 24;

type BAISearchWithScanButtonProps = {
	value: string;
	onChangeText: (value: string) => void;
	onPressScan: () => void;

	onSubmit?: () => void;
	disabled?: boolean;
	scanEnabled?: boolean;
	placeholder?: string;
	maxLength?: number;
	height?: number;

	searchAccessibilityLabel?: string;
	scanAccessibilityLabel?: string;

	style?: StyleProp<ViewStyle>;
	searchStyle?: StyleProp<ViewStyle>;
	scanButtonStyle?: StyleProp<ViewStyle>;
};

export function BAISearchWithScanButton({
	value,
	onChangeText,
	onPressScan,
	onSubmit,
	disabled,
	scanEnabled = true,
	placeholder,
	maxLength = FIELD_LIMITS.search,
	height = DEFAULT_HEIGHT,
	searchAccessibilityLabel = "Search",
	scanAccessibilityLabel = "Scan barcode or QR code",
	style,
	searchStyle,
	scanButtonStyle,
}: BAISearchWithScanButtonProps) {
	const theme = useTheme();

	const borderColor = useMemo(
		() => (theme.dark ? theme.colors.outline : (theme.colors.outlineVariant ?? theme.colors.outline)),
		[theme.colors.outline, theme.colors.outlineVariant, theme.dark],
	);

	const isDisabled = !!disabled;
	const canScan = !isDisabled && !!scanEnabled;
	const iconColor = canScan ? theme.colors.onSurface : theme.colors.onSurfaceDisabled;

	return (
		<View style={[styles.row, style]}>
			<BAISearchBar
				value={value}
				onChangeText={onChangeText}
				onSubmit={onSubmit}
				placeholder={placeholder}
				disabled={isDisabled}
				maxLength={maxLength}
				returnKeyType='search'
				height={height}
				style={[styles.search, { borderColor }, searchStyle]}
				accessibilityLabel={searchAccessibilityLabel}
			/>

			<View style={[styles.scanBtnWrapper, { height, width: height, borderRadius: height / 2 }]}>
				<BAIIconButton
					icon='barcode-scan'
					iconSize={SCAN_ICON_SIZE}
					accessibilityLabel={scanAccessibilityLabel}
					onPress={onPressScan}
					disabled={!canScan}
					variant='outlined'
					iconColor={iconColor}
					style={[
						styles.scanBtn,
						{
							width: height,
							height,
							borderRadius: height / 2,
							borderColor,
							backgroundColor: theme.colors.surface,
						},
						scanButtonStyle,
					]}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	search: {
		flex: 1,
	},
	scanBtnWrapper: {
		overflow: "hidden",
	},
	scanBtn: {
		// Keeps scanner control perfectly circular to match search input height.
	},
});
