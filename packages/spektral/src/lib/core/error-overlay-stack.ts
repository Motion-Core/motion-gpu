interface ErrorOverlayEntry {
	dialog: HTMLElement;
	portalRoot: HTMLElement;
	onDismiss: () => void;
	dismissRequested: boolean;
}

interface ErrorOverlayStack {
	document: Document;
	entries: ErrorOverlayEntry[];
	backgroundElements: Map<HTMLElement, boolean>;
	baselineFocus: HTMLElement | null;
	focusInListener: (event: FocusEvent) => void;
	keydownListener: (event: KeyboardEvent) => void;
	observer: MutationObserver | null;
}

export interface ErrorOverlayRegistration {
	dialog: HTMLElement;
	portalRoot: HTMLElement;
	onDismiss: () => void;
}

const stacks = new WeakMap<Document, ErrorOverlayStack>();

function getTopEntry(stack: ErrorOverlayStack): ErrorOverlayEntry | undefined {
	return stack.entries[stack.entries.length - 1];
}

function getActiveHTMLElement(document: Document): HTMLElement | null {
	const HTMLElementConstructor = document.defaultView?.HTMLElement;
	const activeElement = document.activeElement;

	return HTMLElementConstructor && activeElement instanceof HTMLElementConstructor
		? activeElement
		: null;
}

function getBodyChildContaining(document: Document, element: HTMLElement): HTMLElement | null {
	let current: HTMLElement | null = element;

	while (current?.parentElement && current.parentElement !== document.body) {
		current = current.parentElement;
	}

	return current?.parentElement === document.body ? current : null;
}

function restoreBackgroundElement(stack: ErrorOverlayStack, element: HTMLElement): void {
	const wasInert = stack.backgroundElements.get(element);
	if (wasInert === undefined) return;

	element.inert = wasInert;
	stack.backgroundElements.delete(element);
}

function reconcileBackground(stack: ErrorOverlayStack): void {
	const topEntry = getTopEntry(stack);
	const activeBodyChild = topEntry
		? getBodyChildContaining(stack.document, topEntry.portalRoot)
		: null;
	const nextBackgroundElements = new Set<HTMLElement>();
	const HTMLElementConstructor = stack.document.defaultView?.HTMLElement;

	if (topEntry && HTMLElementConstructor) {
		for (const child of stack.document.body.children) {
			if (!(child instanceof HTMLElementConstructor) || child === activeBodyChild) continue;
			nextBackgroundElements.add(child);
		}
	}

	for (const element of stack.backgroundElements.keys()) {
		if (!nextBackgroundElements.has(element)) {
			restoreBackgroundElement(stack, element);
		}
	}

	for (const element of nextBackgroundElements) {
		if (!stack.backgroundElements.has(element)) {
			stack.backgroundElements.set(element, element.inert);
		}
		element.inert = true;
	}
}

function focusTopEntry(stack: ErrorOverlayStack): void {
	const topEntry = getTopEntry(stack);
	if (!topEntry?.dialog.isConnected) return;

	topEntry.dialog.focus({ preventScroll: true });
}

function createStack(document: Document): ErrorOverlayStack {
	const stack: ErrorOverlayStack = {
		document,
		entries: [],
		backgroundElements: new Map(),
		baselineFocus: getActiveHTMLElement(document),
		focusInListener: () => undefined,
		keydownListener: () => undefined,
		observer: null
	};

	stack.focusInListener = (event: FocusEvent) => {
		const topEntry = getTopEntry(stack);
		const target = event.target;
		if (!topEntry || !target || topEntry.dialog.contains(target as Node)) return;

		focusTopEntry(stack);
	};
	stack.keydownListener = (event: KeyboardEvent) => {
		if (event.key !== 'Escape' || event.defaultPrevented) return;

		const topEntry = getTopEntry(stack);
		if (!topEntry || topEntry.dismissRequested) return;

		event.preventDefault();
		topEntry.dismissRequested = true;
		try {
			topEntry.onDismiss();
		} catch (error) {
			topEntry.dismissRequested = false;
			throw error;
		}
	};

	document.addEventListener('focusin', stack.focusInListener);
	document.addEventListener('keydown', stack.keydownListener);
	const MutationObserverConstructor = document.defaultView?.MutationObserver;
	if (MutationObserverConstructor) {
		stack.observer = new MutationObserverConstructor(() => {
			reconcileBackground(stack);
		});
		stack.observer.observe(document.body, { childList: true });
	}

	stacks.set(document, stack);
	return stack;
}

function destroyStack(stack: ErrorOverlayStack): void {
	stack.document.removeEventListener('focusin', stack.focusInListener);
	stack.document.removeEventListener('keydown', stack.keydownListener);
	stack.observer?.disconnect();

	for (const element of Array.from(stack.backgroundElements.keys())) {
		restoreBackgroundElement(stack, element);
	}

	const restoreTarget = stack.baselineFocus;
	stacks.delete(stack.document);
	if (restoreTarget?.isConnected) {
		restoreTarget.focus({ preventScroll: true });
	}
}

export function registerErrorOverlay({
	dialog,
	portalRoot,
	onDismiss
}: ErrorOverlayRegistration): () => void {
	const document = dialog.ownerDocument;
	const stack = stacks.get(document) ?? createStack(document);
	const entry: ErrorOverlayEntry = { dialog, portalRoot, onDismiss, dismissRequested: false };
	stack.entries.push(entry);

	const activeBodyChild = getBodyChildContaining(document, portalRoot);
	if (activeBodyChild) {
		restoreBackgroundElement(stack, activeBodyChild);
	}
	focusTopEntry(stack);
	reconcileBackground(stack);

	let registered = true;
	return () => {
		if (!registered) return;
		registered = false;

		const entryIndex = stack.entries.indexOf(entry);
		if (entryIndex === -1) return;

		const wasTopEntry = entryIndex === stack.entries.length - 1;
		stack.entries.splice(entryIndex, 1);

		if (stack.entries.length === 0) {
			destroyStack(stack);
			return;
		}

		if (wasTopEntry) {
			const nextTopEntry = getTopEntry(stack);
			const nextActiveBodyChild = nextTopEntry
				? getBodyChildContaining(document, nextTopEntry.portalRoot)
				: null;
			if (nextActiveBodyChild) {
				restoreBackgroundElement(stack, nextActiveBodyChild);
			}
			focusTopEntry(stack);
		}

		reconcileBackground(stack);
	};
}
