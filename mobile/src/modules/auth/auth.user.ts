import type { AuthUser } from "@/modules/auth/auth.types";

type AvatarUser = Pick<AuthUser, "firstName" | "lastName" | "email"> | null | undefined;

function takeInitial(value: string | null | undefined): string {
	const trimmed = String(value ?? "").trim();
	return trimmed ? trimmed.charAt(0).toUpperCase() : "";
}

export function getUserAvatarInitials(user: AvatarUser): string {
	const firstInitial = takeInitial(user?.firstName);
	const lastInitial = takeInitial(user?.lastName);

	if (firstInitial && lastInitial) return `${firstInitial}${lastInitial}`;
	if (firstInitial) return firstInitial;
	if (lastInitial) return lastInitial;

	const emailLocal = String(user?.email ?? "").trim().split("@")[0] ?? "";
	const compactEmailLocal = emailLocal.replace(/[^a-zA-Z0-9]/g, "");

	if (compactEmailLocal.length >= 2) return compactEmailLocal.slice(0, 2).toUpperCase();
	if (compactEmailLocal.length === 1) return compactEmailLocal.toUpperCase();

	return "U";
}
