class CopyError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'CopyError';
	}
}

/**
 * Copies the given text to the clipboard.
 *
 * Uses the modern Clipboard API when available, with a fallback to the legacy
 * `document.execCommand('copy')` approach for older browsers and environments
 * where the Clipboard API may be restricted.
 *
 * @throws {CopyError} when the copy operation fails.
 */
export async function copyToClipboard(text: string): Promise<void> {
	if (!text) throw new CopyError('No content to copy');

	const canUseWindow = typeof window !== 'undefined';
	const canUseDocument = typeof document !== 'undefined';

	// 1. Try the modern Clipboard API
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (canUseWindow && navigator?.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			// Fall through to the legacy method
		}
	}

	// 2. Fallback for environments without a working Clipboard API
	if (canUseDocument) {
		try {
			const textArea = document.createElement('textarea');
			textArea.value = text;

			// Keep it invisible but part of the DOM so the browser allows the copy command
			textArea.style.position = 'fixed';
			textArea.style.left = '-9999px';
			textArea.style.top = '0';
			textArea.setAttribute('readonly', '');
			document.body.appendChild(textArea);

			textArea.focus();
			textArea.select();

			// eslint-disable-next-line @typescript-eslint/no-deprecated
			const supported = document.queryCommandSupported('copy');
			if (supported) {
				// eslint-disable-next-line @typescript-eslint/no-deprecated
				const result = document.execCommand('copy');
				document.body.removeChild(textArea);
				if (result) return;
			} else {
				document.body.removeChild(textArea);
			}
		} catch {
			// Both methods failed
		}
	}

	throw new CopyError('Clipboard unavailable');
}
