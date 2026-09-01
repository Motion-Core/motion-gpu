import { createFrameRegistry, defineMaterial } from 'spektral';
import { applySchedulerPreset } from 'spektral/advanced';
import { createCurrentWritable } from 'spektral/core';
import { captureSchedulerDebugSnapshot } from 'spektral/core/advanced';
import { customRenderPassRuntimeProof } from './custom-render-pass';

const material = defineMaterial({
	fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
});
const registry = createFrameRegistry();
const current = createCurrentWritable(material);

applySchedulerPreset(registry, 'balanced');
document
	.querySelector('#app')
	?.setAttribute(
		'data-contract',
		String(
			captureSchedulerDebugSnapshot(registry).schedule.stages.length +
				current.current.fragment.length +
				Number(customRenderPassRuntimeProof)
		)
	);
