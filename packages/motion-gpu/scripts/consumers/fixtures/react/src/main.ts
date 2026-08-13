import { createElement } from 'react';
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/react';
import {
	useMotionGPUUserContext,
	useSetMotionGPUUserContext
} from '@motion-core/motion-gpu/react/advanced';

const material = defineMaterial({
	fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
});

export const publicContract = {
	component: createElement(FragCanvas, { material }),
	useMotionGPUUserContext,
	useSetMotionGPUUserContext
};
