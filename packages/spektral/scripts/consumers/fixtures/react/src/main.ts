import { createElement } from 'react';
import { FragCanvas, defineMaterial } from 'spektral/react';
import { useSpektralUserContext, useSetSpektralUserContext } from 'spektral/react/advanced';

const material = defineMaterial({
	fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
});

export const publicContract = {
	component: createElement(FragCanvas, { material }),
	useSpektralUserContext,
	useSetSpektralUserContext
};
