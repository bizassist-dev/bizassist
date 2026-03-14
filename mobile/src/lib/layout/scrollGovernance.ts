const STANDARD_SCROLL_CONTENT_BOTTOM_PADDING = 24;
const STANDARD_SCROLL_KEYBOARD_BOTTOM_PADDING = 250;

type StandardScrollBottomPaddingOptions = {
	basePadding?: number;
	extraPadding?: number;
	keyboardOpen?: boolean;
};

export function getStandardScrollBottomPadding({
	basePadding = STANDARD_SCROLL_CONTENT_BOTTOM_PADDING,
	extraPadding = 0,
	keyboardOpen = false,
}: StandardScrollBottomPaddingOptions = {}): number {
	const resolvedBasePadding = Math.max(0, basePadding);
	const resolvedExtraPadding = Math.max(0, extraPadding);

	return resolvedBasePadding + resolvedExtraPadding + (keyboardOpen ? STANDARD_SCROLL_KEYBOARD_BOTTOM_PADDING : 0);
}
