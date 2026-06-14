declare module 'react' {
	export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
	export function useState<T>(
		initialState: T | (() => T)
	): [T, (value: T | ((prev: T) => T)) => void];
	export function useRef<T>(initialValue: T | null): { current: T | null };
	export function useRef<T = undefined>(): { current: T | undefined };
}

declare module 'react/jsx-runtime' {
	export const Fragment: unknown;
	export function jsx(type: unknown, props: unknown, key?: unknown): unknown;
	export function jsxs(type: unknown, props: unknown, key?: unknown): unknown;
}

declare namespace JSX {
	interface IntrinsicElements {
		[name: string]: unknown;
	}
}
