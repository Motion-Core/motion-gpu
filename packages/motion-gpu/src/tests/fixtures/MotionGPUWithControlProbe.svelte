<script lang="ts">
	import FragCanvas from '../../lib/FragCanvas.svelte';
	import { defineMaterial } from '../../lib/core/material';
	import type { RenderMode } from '../../lib/core/types';
	import MotionGPUProbe from './MotionGPUProbe.svelte';

	interface Props {
		onProbe: (value: unknown) => void;
		renderMode?: RenderMode;
	}

	let { onProbe, renderMode = 'always' }: Props = $props();

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.4, 1.0);
}
`
	});
</script>

<FragCanvas {material} {renderMode} showErrorOverlay={false}>
	<MotionGPUProbe {onProbe} />
</FragCanvas>
