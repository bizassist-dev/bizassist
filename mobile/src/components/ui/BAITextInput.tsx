// path: src/components/ui/BAITextInput.tsx
import React from "react";
import { StyleSheet } from "react-native";
import { HelperText, TextInput, useTheme } from "react-native-paper";
import { sanitizeTextInput, stripControlChars } from "@/shared/text/sanitizeText";

type BAITextInputShape = "default" | "pill";

type BAITextInputSanitizeOptions = {
	enabled?: boolean;
	allowNewlines?: boolean;
	allowTabs?: boolean;
	normalizeWhitespace?: boolean;
};

type BAITextInputProps = React.ComponentProps<typeof TextInput> & {
	errorMessage?: string;
	shape?: BAITextInputShape;
	height?: number;
	sanitizeOptions?: BAITextInputSanitizeOptions;
};

export const BAITextInput = React.forwardRef<any, BAITextInputProps>(function BAITextInput(
	{
		error,
		errorMessage,
		style,
		contentStyle,
		height,
		outlineColor,
		activeOutlineColor,
		shape = "default",
		multiline = false,
		numberOfLines,
		scrollEnabled,
		value,
		onChangeText,
		onBlur,
		secureTextEntry,
		sanitizeOptions,
		...rest
	}: BAITextInputProps,
	ref,
) {
	const theme = useTheme();

	const resolvedOutlineColor = outlineColor ?? (theme.colors.outlineVariant ?? theme.colors.outline);

	const resolvedActiveOutlineColor = activeOutlineColor ?? theme.colors.primary;

	const outlineRadius = shape === "pill" ? 999 : 14;
	const inputRadius = shape === "pill" ? 999 : 14;
	const resolvedLines = typeof numberOfLines === "number" ? numberOfLines : multiline ? 3 : 1;
	const resolvedScrollEnabled = typeof scrollEnabled === "boolean" ? scrollEnabled : multiline;
	const sanitizeEnabled = sanitizeOptions?.enabled ?? true;
	const normalizeWhitespaceOnEdit = sanitizeOptions?.normalizeWhitespace ?? false;
	const allowNewlines = sanitizeOptions?.allowNewlines ?? multiline;
	const allowTabs = sanitizeOptions?.allowTabs ?? allowNewlines;

	const sanitizeForChange = React.useCallback(
		(input: string) => {
			if (secureTextEntry) {
				return stripControlChars(input, { allowNewlines: false, allowTabs: false });
			}
			return stripControlChars(input, { allowNewlines, allowTabs });
		},
		[allowNewlines, allowTabs, secureTextEntry],
	);

	const sanitizeForBlur = React.useCallback(
		(input: string) => {
			if (secureTextEntry) {
				return stripControlChars(input, { allowNewlines: false, allowTabs: false });
			}
			return sanitizeTextInput(input, {
				allowNewlines,
				allowTabs,
				normalizeWhitespace: normalizeWhitespaceOnEdit,
			});
		},
		[allowNewlines, allowTabs, normalizeWhitespaceOnEdit, secureTextEntry],
	);

	const resolvedOnChangeText = React.useCallback(
		(next: string) => {
			if (!onChangeText) return;
			if (!sanitizeEnabled) {
				onChangeText(next);
				return;
			}
			onChangeText(sanitizeForChange(next));
		},
		[onChangeText, sanitizeEnabled, sanitizeForChange],
	);

	const resolvedOnBlur = React.useCallback(
		(event: any) => {
			if (sanitizeEnabled && onChangeText && typeof value === "string") {
				const sanitized = sanitizeForBlur(value);
				if (sanitized !== value) {
					onChangeText(sanitized);
				}
			}
			onBlur?.(event);
		},
		[onBlur, onChangeText, sanitizeEnabled, sanitizeForBlur, value],
	);

	const fixedHeightStyle =
		typeof height === "number"
			? {
					height,
					minHeight: height,
					maxHeight: height,
				}
			: null;
	const centeredText = height && !multiline ? styles.centeredText : null;

	return (
		<>
			<TextInput
				ref={ref}
				mode='outlined'
				style={[styles.input, { backgroundColor: theme.colors.surface }, fixedHeightStyle, style]}
				outlineStyle={[styles.outline, { borderRadius: outlineRadius, borderWidth: StyleSheet.hairlineWidth }]}
				error={error}
				outlineColor={resolvedOutlineColor}
				activeOutlineColor={resolvedActiveOutlineColor}
				multiline={multiline}
				numberOfLines={resolvedLines}
				scrollEnabled={resolvedScrollEnabled}
				value={value}
				onChangeText={resolvedOnChangeText}
				onBlur={resolvedOnBlur}
				secureTextEntry={secureTextEntry}
				contentStyle={[fixedHeightStyle, centeredText, contentStyle]}
				{...rest}
				theme={{
					...theme,
					roundness: inputRadius,
				}}
			/>
			{errorMessage ? (
				<HelperText type='error' visible>
					{errorMessage}
				</HelperText>
			) : null}
		</>
	);
});

const styles = StyleSheet.create({
	input: {
		marginBottom: 4,
	},
	outline: {
		borderRadius: 14,
	},
	centeredText: {
		textAlignVertical: "center",
		paddingVertical: 0,
	},
});
