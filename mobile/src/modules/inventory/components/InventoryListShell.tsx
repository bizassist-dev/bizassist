// BizAssist_mobile
// path: src/modules/inventory/components/InventoryListShell.tsx
//
// Refactor:
// - Use reusable loader: BAIActivityIndicator (system)
// - Remove visible scrollbar bleed by clipping the body container (overflow: "hidden")
// - ✅ In the Items and Services section: remove number of items + remove synced badge
//   (i.e., remove header-right badge entirely; keep countLabel support for other shells if needed)

import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "react-native-paper";

import { BAIEmptyStateButton } from "@/components/ui/BAIEmptyStateButton";
import { BAIRetryButton } from "@/components/ui/BAIRetryButton";
import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAIActivityIndicator } from "@/components/system/BAIActivityIndicator";
import type { BAIButtonShape } from "@/lib/ui/buttonGovernance";

type Props = {
	title?: string;
	countLabel?: string;
	showBorder?: boolean;
	surface?: boolean;

	isLoading?: boolean;
	isFetching?: boolean; // kept for backward-compat; no longer rendered as a badge in the header
	isError?: boolean;

	onRetry?: () => void;

	emptyTitle?: string;
	emptyBody?: string;

	showPrimaryEmptyCta?: boolean;
	primaryEmptyCtaLabel?: string;
	onPrimaryEmptyCta?: () => void;
	primaryEmptyCtaShape?: BAIButtonShape;

	topContent?: React.ReactNode;
	children?: React.ReactNode;
	containerStyle?: StyleProp<ViewStyle>;
};

export function InventoryListShell(props: Props) {
	const {
		title,
		showBorder = true,
		surface = true,

		isLoading,
		// isFetching, // intentionally unused (badge removed)
		isError,

		onRetry,

		emptyTitle,
		emptyBody,

		showPrimaryEmptyCta,
		primaryEmptyCtaLabel,
		onPrimaryEmptyCta,
		primaryEmptyCtaShape,

		topContent,
		children,
		containerStyle,
	} = props;

	const theme = useTheme();

	const borderColor = theme.colors.outlineVariant ?? theme.colors.outline;

	const showEmpty = !isLoading && !isError && !!emptyTitle;
	const showError = !!isError;
	const showHeader = !!title;
	const rootStyle = [
		surface ? styles.shell : styles.shellPlain,
		showBorder ? { borderColor } : styles.shellBorderless,
		containerStyle,
	];
	const clipStyle = [surface ? styles.clip : styles.clipPlain];
	const content = (
		<View style={clipStyle}>
			{showHeader ? (
				<View style={styles.header}>
					<View style={styles.headerLeft}>
						<BAIText variant='subtitle'>{title}</BAIText>

						{/* ✅ Count label removed for Items/Services by not passing countLabel from screen.
						    Component remains generic: if another screen wants it, it can still pass it. */}
					</View>

					{/* ✅ Synced badge removed entirely */}
				</View>
			) : null}

			{topContent ? (
				<View style={[styles.headerContent, { borderBottomColor: borderColor }]}>{topContent}</View>
			) : null}

			<View style={styles.body}>
				{isLoading ? (
					<View style={styles.center}>
						<BAIActivityIndicator size='small' />
						<BAIText variant='body' muted style={{ marginTop: 10 }}>
							Loading…
						</BAIText>
					</View>
				) : showError ? (
					<View style={styles.center}>
						<BAIText variant='body'>Something went wrong.</BAIText>
						{onRetry ? (
							<View style={{ marginTop: 12 }}>
								<BAIRetryButton variant='outline' mode='contained' onPress={onRetry}>
									Retry
								</BAIRetryButton>
							</View>
						) : null}
					</View>
				) : showEmpty ? (
					<View style={styles.empty}>
						<BAIText variant='subtitle' style={{ textAlign: "center" }}>
							{emptyTitle}
						</BAIText>

						{emptyBody ? (
							<BAIText variant='body' muted style={{ textAlign: "center", marginTop: 6 }}>
								{emptyBody}
							</BAIText>
						) : null}

						{showPrimaryEmptyCta && primaryEmptyCtaLabel && onPrimaryEmptyCta ? (
							<View style={{ marginTop: 14 }}>
								<BAIEmptyStateButton
									mode='contained'
									onPress={onPrimaryEmptyCta}
									label={primaryEmptyCtaLabel}
									shape={primaryEmptyCtaShape}
								/>
							</View>
						) : null}
					</View>
				) : (
					children
				)}
			</View>
		</View>
	);

	if (!surface) {
		return <View style={rootStyle}>{content}</View>;
	}

	return (
		<BAISurface style={rootStyle} padded={false}>
			{content}
		</BAISurface>
	);
}

const styles = StyleSheet.create({
	shell: {
		flex: 1, // ensures it can occupy vertical space when parent gives room
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
	},
	shellPlain: {
		flex: 1,
		minHeight: 0,
		borderWidth: 0,
		borderRadius: 0,
	},
	shellBorderless: {
		borderWidth: 0,
	},

	clip: {
		flex: 1,
		borderRadius: 16,
		overflow: "hidden",
	},
	clipPlain: {
		flex: 1,
		minHeight: 0,
		overflow: "hidden",
	},

	header: {
		paddingHorizontal: 14,
		paddingTop: 12,
		paddingBottom: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	headerContent: {
		paddingHorizontal: 14,
		paddingTop: 0,
		paddingBottom: 8,
	},

	headerLeft: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},

	body: {
		flex: 1,
		paddingHorizontal: 12,
		paddingBottom: 12,
		paddingTop: 0,

		// ✅ Key change: prevents scroll indicator/overscroll glow from leaking outside surface bounds.
		// Safe because scrolling is owned by children (FlatList/ScrollView), not the shell.
		overflow: "hidden",
	},
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},

	empty: {
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},
});
