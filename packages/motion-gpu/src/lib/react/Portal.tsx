import type { ReactNode } from 'react';

export interface PortalProps {
	target?: string | HTMLElement | null;
	children?: ReactNode;
}

/**
 * React implementation placeholder. Full runtime wiring is implemented in a follow-up step.
 */
export function Portal({ children }: PortalProps) {
	return <>{children ?? null}</>;
}
