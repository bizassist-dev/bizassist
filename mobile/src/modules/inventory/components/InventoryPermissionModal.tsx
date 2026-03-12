import React from "react";
import { StyleSheet } from "react-native";
import { Modal, Portal } from "react-native-paper";

import { BAISurface } from "@/components/ui/BAISurface";
import { BAIText } from "@/components/ui/BAIText";
import { BAIButton } from "@/components/ui/BAIButton";

type InventoryPermissionModalProps = {
	visible: boolean;
	message: string;
	borderColor: string;
	onClose: () => void;
	allowSettings?: boolean;
	onOpenSettings?: () => void;
	title?: string;
};

export function InventoryPermissionModal({
	visible,
	message,
	borderColor,
	onClose,
	allowSettings = false,
	onOpenSettings,
	title = "Select Photo",
}: InventoryPermissionModalProps) {
	return (
		<Portal>
			<Modal visible={visible} onDismiss={onClose} dismissable={false} contentContainerStyle={styles.modalHost}>
				<BAISurface style={[styles.modalCard, { borderColor }]} padded>
					<BAIText variant='title'>{title}</BAIText>
					<BAIText variant='body' muted style={{ marginTop: 8 }}>
						{message}
					</BAIText>
					{allowSettings && onOpenSettings ? (
						<BAIButton intent='primary' variant='solid' shape='pill' onPress={onOpenSettings} style={{ marginTop: 14 }}>
							Open Settings
						</BAIButton>
					) : null}
					<BAIButton
						intent='primary'
						variant={allowSettings ? "outline" : "solid"}
						onPress={onClose}
						style={{ marginTop: 14 }}
					>
						Close
					</BAIButton>
				</BAISurface>
			</Modal>
		</Portal>
	);
}

const styles = StyleSheet.create({
	modalHost: { paddingHorizontal: 16 },
	modalCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 18 },
});
