export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
	return typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function motionDuration(duration: number): number {
	return prefersReducedMotion() ? 0 : duration;
}

export function motionDistance(distance: number): number {
	return prefersReducedMotion() ? 0 : distance;
}
