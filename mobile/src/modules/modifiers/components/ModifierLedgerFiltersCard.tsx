import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
	search: ReactNode;
	tabs: ReactNode;
	borderColor: string;
	backgroundColor: string;
	style?: StyleProp<ViewStyle>;
};

export function ModifierLedgerFiltersCard({
	search,
	tabs,
	borderColor,
	backgroundColor,
	style,
}: Props) {
	return (
		<View style={[styles.container, { borderColor, backgroundColor }, style]}>
			<View style={styles.content}>
				{search}
				<View style={styles.tabsWrap}>{tabs}</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 8,
		paddingTop: 8,
		paddingBottom: 6,
	},
	content: {
		gap: 4,
	},
	tabsWrap: {
		paddingTop: 4,
	},
});
