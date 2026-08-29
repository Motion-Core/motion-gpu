import { defineMaterial } from '@motion-core/motion-gpu';
import type { AnyPass, RenderPass } from '@motion-core/motion-gpu';

let renderCalls = 0;

export const structuralCustomRenderPass = {
	enabled: true,
	needsSwap: false,
	render() {
		renderCalls += 1;
	}
} satisfies RenderPass;

const acceptedPasses: AnyPass[] = [structuralCustomRenderPass];
const material = defineMaterial({
	fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
});

structuralCustomRenderPass.render();
export const customRenderPassRuntimeProof =
	acceptedPasses[0] === structuralCustomRenderPass &&
	renderCalls === 1 &&
	Object.isFrozen(material);

if (!customRenderPassRuntimeProof) {
	throw new Error('Packed structural custom RenderPass contract failed.');
}
