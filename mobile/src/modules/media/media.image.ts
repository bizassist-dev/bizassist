function normalizeSeed(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return "";
}

function isRemoteUri(uri: string): boolean {
	return /^https?:\/\//i.test(uri);
}

export function toCacheBustedImageUri(rawUri: unknown, versionSeed?: unknown): string {
	const uri = typeof rawUri === "string" ? rawUri.trim() : "";
	if (!uri) return "";
	if (!isRemoteUri(uri)) return uri;

	const seed = normalizeSeed(versionSeed);
	if (!seed) return uri;

	try {
		const url = new URL(uri);
		url.searchParams.set("v", seed);
		return url.toString();
	} catch {
		const joiner = uri.includes("?") ? "&" : "?";
		return `${uri}${joiner}v=${encodeURIComponent(seed)}`;
	}
}