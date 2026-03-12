import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutAnimation, Platform, UIManager } from "react-native";

type UseInsertedRowAttentionArgs = {
	scopeKey: string;
	ttlMs?: number;
};

const DEFAULT_TTL_MS = 1_600;

const INSERT_LAYOUT_ANIMATION = LayoutAnimation.Presets.easeInEaseOut;

export function useInsertedRowAttention(
	ids: readonly string[],
	args: UseInsertedRowAttentionArgs,
): Readonly<Record<string, number>> {
	const ttlMs = args.ttlMs ?? DEFAULT_TTL_MS;
	const [attentionTokens, setAttentionTokens] = useState<Record<string, number>>({});
	const previousIdsRef = useRef<readonly string[]>([]);
	const initializedRef = useRef(false);
	const scopeKeyRef = useRef(args.scopeKey);
	const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	useEffect(() => {
		if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
			UIManager.setLayoutAnimationEnabledExperimental(true);
		}
	}, []);

	useEffect(() => {
		return () => {
			for (const timer of timersRef.current.values()) {
				clearTimeout(timer);
			}
			timersRef.current.clear();
		};
	}, []);

	useEffect(() => {
		if (scopeKeyRef.current !== args.scopeKey) {
			scopeKeyRef.current = args.scopeKey;
			previousIdsRef.current = ids;
			initializedRef.current = true;
			for (const timer of timersRef.current.values()) {
				clearTimeout(timer);
			}
			timersRef.current.clear();
			setAttentionTokens({});
			return;
		}

		if (!initializedRef.current) {
			previousIdsRef.current = ids;
			initializedRef.current = true;
			return;
		}

		const previousIds = previousIdsRef.current;
		previousIdsRef.current = ids;

		if (ids.length === 0 || previousIds.length === 0) return;

		const previousIdSet = new Set(previousIds);
		const insertedIds = ids.filter((id) => !previousIdSet.has(id));
		if (insertedIds.length === 0) return;

		LayoutAnimation.configureNext(INSERT_LAYOUT_ANIMATION);

		setAttentionTokens((current) => {
			const next = { ...current };
			const seed = Date.now();
			insertedIds.forEach((id, index) => {
				next[id] = seed + index;
			});
			return next;
		});

		insertedIds.forEach((id) => {
			const existingTimer = timersRef.current.get(id);
			if (existingTimer) clearTimeout(existingTimer);

			const timer = setTimeout(() => {
				timersRef.current.delete(id);
				setAttentionTokens((current) => {
					if (!(id in current)) return current;
					const next = { ...current };
					delete next[id];
					return next;
				});
			}, ttlMs);

			timersRef.current.set(id, timer);
		});
	}, [args.scopeKey, ids, ttlMs]);

	return useMemo(() => attentionTokens, [attentionTokens]);
}
