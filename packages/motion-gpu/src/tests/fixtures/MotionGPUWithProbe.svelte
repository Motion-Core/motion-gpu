<script lang="ts">
	import FragCanvas from '../../lib/svelte/FragCanvas.svelte';
	import { defineMaterial } from '../../lib/core/material';
	import MotionGPUProbe from './MotionGPUProbe.svelte';

	interface Props {
		onProbe: (value: unknown) => void;
	}

	let { onProbe }: Props = $props();

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.2, 1.0);
}
`
	});
</script>

<FragCanvas {material}>
	<MotionGPUProbe {onProbe} />
</FragCanvas>
