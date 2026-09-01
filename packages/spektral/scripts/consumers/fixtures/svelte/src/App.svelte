<script lang="ts">
	import { FragCanvas, defineMaterial } from 'spektral/svelte';
	import type { RenderPass } from 'spektral/svelte';
	import { setSpektralUserContext, useSpektralUserContext } from 'spektral/svelte/advanced';

	const material = defineMaterial({
		fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
	});
	const structuralCustomRenderPass = {
		enabled: true,
		needsSwap: false,
		render() {
			document.documentElement.dataset.packedCustomRenderPass = 'executed';
		}
	} satisfies RenderPass;
	const passes = [structuralCustomRenderPass];

	void setSpektralUserContext;
	void useSpektralUserContext;
</script>

<FragCanvas {material} {passes} />
