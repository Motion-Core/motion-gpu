<script lang="ts">
	import { useFrame } from '../../lib/svelte/frame-context';

	export type FrameMutationMode = 'none' | 'valid-both' | 'invalid-uniform' | 'invalid-texture';

	interface Props {
		mode?: FrameMutationMode;
	}

	let { mode = 'none' }: Props = $props();
	const runtimeTexture = document.createElement('canvas');
	runtimeTexture.width = 2;
	runtimeTexture.height = 2;
	let applied = false;

	useFrame(
		({ setUniform, setTexture }) => {
			if (applied || mode === 'none') {
				return;
			}
			applied = true;

			if (mode === 'valid-both') {
				setUniform('uGain', 0.75);
				setTexture('uTex', runtimeTexture);
				return;
			}

			if (mode === 'invalid-uniform') {
				setUniform('uMissing', 1);
				return;
			}

			setTexture('uMissing', runtimeTexture);
		},
		{ autoInvalidate: false }
	);
</script>
