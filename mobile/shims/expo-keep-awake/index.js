const React = require("react");
const Constants = require("expo-constants");
const KeepAwake = require("../../node_modules/expo-keep-awake");

function isExpoGo() {
	return Constants?.appOwnership === "expo";
}

function ignoreKeepAwakeFailure() {
	return undefined;
}

function safeActivateAsync(tag) {
	// Avoid crashing Expo Go/dev when keep-awake cannot be activated.
	if (__DEV__ && isExpoGo()) {
		return Promise.resolve();
	}

	try {
		const maybePromise = KeepAwake.activateKeepAwakeAsync(tag);
		if (maybePromise && typeof maybePromise.catch === "function") {
			return maybePromise.catch(ignoreKeepAwakeFailure);
		}
		return Promise.resolve();
	} catch (err) {
		return Promise.resolve();
	}
}

function safeActivate(tag) {
	// Keep deprecated warning behavior when available.
	if (typeof KeepAwake.activateKeepAwake === "function") {
		try {
			const maybePromise = KeepAwake.activateKeepAwake(tag);
			if (maybePromise && typeof maybePromise.catch === "function") {
				return maybePromise.catch(ignoreKeepAwakeFailure);
			}
			return Promise.resolve();
		} catch (err) {
			return Promise.resolve();
		}
	}

	return safeActivateAsync(tag);
}

function useKeepAwake(tag, options) {
	const defaultTag = React.useId();
	const tagOrDefault = tag ?? defaultTag;

	React.useEffect(() => {
		let isMounted = true;

		safeActivateAsync(tagOrDefault)
			.then(() => {
				if (isMounted && options?.listener) {
					try {
						KeepAwake.addListener(tagOrDefault, options.listener);
					} catch {}
				}
			})
			// Ignore activation errors (e.g., missing activity) to avoid noisy dev crashes.
			.catch(() => {});

		return () => {
			isMounted = false;
			const deactivate = KeepAwake.deactivateKeepAwake(tagOrDefault);
			if (options?.suppressDeactivateWarnings) {
				deactivate.catch(() => {});
			}
		};
	}, [tagOrDefault]);
}

module.exports = {
	...KeepAwake,
	activateKeepAwakeAsync: safeActivateAsync,
	activateKeepAwake: safeActivate,
	useKeepAwake,
};
