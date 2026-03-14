<script lang="ts">
	import FragCanvas from '../../lib/svelte/FragCanvas.svelte';
	import type { MotionGPUErrorReport } from '../../lib/core/error-report';
	import type { FragMaterial } from '../../lib/core/material';
	import FrameMutationProbe, { type FrameMutationMode } from './FrameMutationProbe.svelte';

	interface Props {
		material: FragMaterial;
		mode?: FrameMutationMode;
		onError?: (report: MotionGPUErrorReport) => void;
		showErrorOverlay?: boolean;
	}

	let { material, mode = 'none', onError = undefined, showErrorOverlay = false }: Props = $props();
</script>

<FragCanvas {material} {showErrorOverlay} {...onError ? { onError } : {}}>
	<FrameMutationProbe {mode} />
</FragCanvas>
