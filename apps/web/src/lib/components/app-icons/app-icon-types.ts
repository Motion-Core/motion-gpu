import type { SVGAttributes } from 'svelte/elements';

export type AppIconProps = SVGAttributes<SVGSVGElement> & {
	size?: string | number;
	strokeWidth?: number;
	absoluteStrokeWidth?: boolean;
	color?: string;
};
