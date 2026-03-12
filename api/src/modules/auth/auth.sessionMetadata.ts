export type AuthSessionMetadata = {
	version: 1;
	deviceId: string;
	deviceName: string | null;
	clientUserAgent: string | null;
};

type AuthSessionMetadataInput = {
	deviceId: string;
	deviceName?: string | null;
	clientUserAgent?: string | null;
};

function normalizeOptional(value: string | null | undefined): string | null {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 ? normalized : null;
}

export function serializeAuthSessionMetadata(input: AuthSessionMetadataInput): string {
	return JSON.stringify({
		version: 1,
		deviceId: input.deviceId,
		deviceName: normalizeOptional(input.deviceName),
		clientUserAgent: normalizeOptional(input.clientUserAgent),
	} satisfies AuthSessionMetadata);
}

export function parseAuthSessionMetadata(rawValue: string | null | undefined): AuthSessionMetadata | null {
	const raw = String(rawValue ?? "").trim();
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Partial<AuthSessionMetadata>;
		if (!parsed || typeof parsed !== "object") return null;
		if (parsed.version !== 1 || typeof parsed.deviceId !== "string" || parsed.deviceId.trim().length === 0) {
			return null;
		}

		return {
			version: 1,
			deviceId: parsed.deviceId.trim(),
			deviceName: normalizeOptional(parsed.deviceName),
			clientUserAgent: normalizeOptional(parsed.clientUserAgent),
		};
	} catch {
		// Legacy records stored the deviceId directly in userAgent.
		return {
			version: 1,
			deviceId: raw,
			deviceName: null,
			clientUserAgent: null,
		};
	}
}
