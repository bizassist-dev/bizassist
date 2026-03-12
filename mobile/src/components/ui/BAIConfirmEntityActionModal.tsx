import { ConfirmActionModal } from "@/components/settings/ConfirmActionModal";

type BAIEntityConfirmModalProps = {
	visible: boolean;
	entityLabel: string;
	entityName?: string | null;
	description?: string;
	onDismiss: () => void;
	onConfirm: () => void;
	disabled?: boolean;
};

function toTitleCase(value: string): string {
	return String(value ?? "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatEntityTarget(entityLabel: string, entityName?: string | null): string {
	const safeName = String(entityName ?? "").trim();
	if (safeName) return `"${safeName}"`;
	return `this ${String(entityLabel ?? "").trim().toLowerCase() || "item"}`;
}

function buildMessage(actionVerb: string, entityLabel: string, entityName?: string | null, description?: string): string {
	const actionLine = `This action will ${actionVerb} ${formatEntityTarget(entityLabel, entityName)}.`;
	const safeDescription = String(description ?? "").trim();
	return safeDescription ? `${safeDescription}\n\n${actionLine}` : actionLine;
}

export function BAIConfirmArchiveModal({
	visible,
	entityLabel,
	entityName,
	description,
	onDismiss,
	onConfirm,
	disabled,
}: BAIEntityConfirmModalProps) {
	return (
		<ConfirmActionModal
			visible={visible}
			title={`Archive ${toTitleCase(entityLabel)}`}
			message={buildMessage("archive", entityLabel, entityName, description)}
			confirmLabel='Archive'
			cancelLabel='Cancel'
			confirmIntent='danger'
			onDismiss={onDismiss}
			onCancel={onDismiss}
			onConfirm={onConfirm}
			disabled={disabled}
		/>
	);
}

export function BAIConfirmRestoreModal({
	visible,
	entityLabel,
	entityName,
	description,
	onDismiss,
	onConfirm,
	disabled,
}: BAIEntityConfirmModalProps) {
	return (
		<ConfirmActionModal
			visible={visible}
			title={`Restore ${toTitleCase(entityLabel)}`}
			message={buildMessage("restore", entityLabel, entityName, description)}
			confirmLabel='Restore'
			cancelLabel='Cancel'
			confirmIntent='primary'
			onDismiss={onDismiss}
			onCancel={onDismiss}
			onConfirm={onConfirm}
			disabled={disabled}
		/>
	);
}

export function BAIConfirmDeleteModal({
	visible,
	entityLabel,
	entityName,
	description,
	onDismiss,
	onConfirm,
	disabled,
}: BAIEntityConfirmModalProps) {
	return (
		<ConfirmActionModal
			visible={visible}
			title={`Delete ${toTitleCase(entityLabel)}`}
			message={buildMessage("delete", entityLabel, entityName, description)}
			confirmLabel='Delete'
			cancelLabel='Cancel'
			confirmIntent='danger'
			onDismiss={onDismiss}
			onCancel={onDismiss}
			onConfirm={onConfirm}
			disabled={disabled}
		/>
	);
}
