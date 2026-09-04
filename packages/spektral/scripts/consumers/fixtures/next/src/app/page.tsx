'use client';

import { defineMaterial } from 'spektral/react';

const material = defineMaterial({
	fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
});

export default function Page() {
	return <p data-packed-consumer="next">{material.fragment.length}</p>;
}
