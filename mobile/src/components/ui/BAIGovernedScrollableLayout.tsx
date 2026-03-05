import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type BAIGovernedScrollableLayoutProps = {
	top: React.ReactNode;
	scrollArea: React.ReactNode;
	bottom?: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	topStyle?: StyleProp<ViewStyle>;
	scrollAreaStyle?: StyleProp<ViewStyle>;
	bottomStyle?: StyleProp<ViewStyle>;
};

/**
 * Scrollable Screen Layout Governance:
 * - top: fixed zone (never scrolls)
 * - scrollArea: single vertical scroll owner zone
 * - bottom: optional fixed zone
 */
export function BAIGovernedScrollableLayout({
	top,
	scrollArea,
	bottom,
	style,
	topStyle,
	scrollAreaStyle,
	bottomStyle,
}: BAIGovernedScrollableLayoutProps) {
	return (
		<View style={[styles.root, style]}>
			<View style={topStyle}>{top}</View>
			<View style={[styles.scrollArea, scrollAreaStyle]}>{scrollArea}</View>
			{bottom ? <View style={bottomStyle}>{bottom}</View> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		minHeight: 0,
	},
	scrollArea: {
		flex: 1,
		minHeight: 0,
	},
});
