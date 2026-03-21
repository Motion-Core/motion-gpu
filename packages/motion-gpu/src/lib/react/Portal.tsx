import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface PortalProps {
	target?: string | HTMLElement | null;
	children?: ReactNode;
}

function resolveTargetElement(input: string | HTMLElement | null | undefined): HTMLElement {
	if (typeof document === 'undefined') {
		throw new Error('Portal target resolution requires a browser environment');
	}

	return typeof input === 'string'
		? (document.querySelector<HTMLElement>(input) ?? document.body)
		: (input ?? document.body);
}

export function Portal({ target = 'body', children }: PortalProps) {
	const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

	useEffect(() => {
		if (typeof document === 'undefined') {
			return;
		}
		setTargetElement(resolveTargetElement(target));
	}, [target]);

	if (!targetElement) {
		return null;
	}

	return createPortal(children ?? null, targetElement);
}
