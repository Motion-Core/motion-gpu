declare module 'react' {
	export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
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
