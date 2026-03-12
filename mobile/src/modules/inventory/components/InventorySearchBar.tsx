// BizAssist_mobile
// path: src/modules/inventory/components/InventorySearchBar.tsx

import { useCallback, useMemo } from "react";
import { StyleSheet } from "react-native";

import { BAISearchWithScanButton } from "@/components/ui/BAISearchWithScanButton";

import { FIELD_LIMITS } from "@/shared/fieldLimits";

const INPUT_HEIGHT = 56;

type Props = {
	value: string;
	onChangeText: (v: string) => void;

	// Scan button
	onPressScan: () => void;

	// Optional enhancements (backward-safe)
	onSubmit?: () => void;
	scanEnabled?: boolean;
	placeholder?: string;
	disabled?: boolean;
};

export function InventorySearchBar({
	value,
	onChangeText,
	onPressScan,
	onSubmit,
	scanEnabled = true,
	placeholder,
	disabled,
}: Props) {
	const ph = useMemo(() => placeholder ?? "Search ", [placeholder]);

	const isDisabled = !!disabled;
	const canSubmit = !isDisabled && typeof onSubmit === "function";

	// BAISearchBar already enforces maxLength and caps input; keep a tight wrapper for parity
	// and to make future governance changes local.
	const handleChangeText = useCallback(
		(v: string) => {
			// BAISearchBar caps, but we keep this as an additional safety net.
			onChangeText(v.length > FIELD_LIMITS.search ? v.slice(0, FIELD_LIMITS.search) : v);
		},
		[onChangeText],
	);

	const handleSubmit = useCallback(() => {
		if (!canSubmit) return;
		// Trim on submit to keep query keys deterministic and avoid “space-only” searches.
		onChangeText((value ?? "").trim());
		onSubmit?.();
	}, [canSubmit, onChangeText, onSubmit, value]);

	return (
		<BAISearchWithScanButton
			value={value}
			onChangeText={handleChangeText}
			onPressScan={onPressScan}
			onSubmit={canSubmit ? handleSubmit : undefined}
			scanEnabled={scanEnabled}
			placeholder={ph}
			disabled={isDisabled}
			maxLength={FIELD_LIMITS.search}
			height={INPUT_HEIGHT}
			searchAccessibilityLabel='Search inventory'
			scanAccessibilityLabel='Scan barcode or QR code'
			style={styles.row}
			searchStyle={styles.search}
			scanButtonStyle={styles.scanBtn}
		/>
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
	scanBtn: {
		// Keep icon button perfectly square and aligned with pill language
	},
});
