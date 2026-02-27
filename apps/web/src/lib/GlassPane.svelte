<script lang="ts">
	import { FragCanvas } from '@motion-core/motion-gpu';
	import GlassPaneScene, { glassPaneMaterial } from './GlassPaneScene.svelte';
	import type { ComponentProps } from 'svelte';

	type SceneProps = ComponentProps<typeof GlassPaneScene>;

	interface Props {
		image: SceneProps['image'];
		class?: string;
		distortion?: SceneProps['distortion'];
		chromaticAberration?: SceneProps['chromaticAberration'];
		speed?: SceneProps['speed'];
		waviness?: SceneProps['waviness'];
		frequency?: SceneProps['frequency'];
		rods?: SceneProps['rods'];
		[key: string]: unknown;
	}

	let {
		image,
		class: className = '',
		distortion = 1.0,
		chromaticAberration = 0.005,
		speed = 1.0,
		waviness = 0.05,
		frequency = 6.0,
		rods = 5.0,
		...rest
	}: Props = $props();

	const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
	const containerClass = $derived(`relative h-full w-full overflow-hidden ${className}`.trim());
</script>

<div class={containerClass} {...rest}>
	<div class="absolute inset-0 z-0">
		<FragCanvas material={glassPaneMaterial} {dpr} class="h-full w-full">
			<GlassPaneScene
				{image}
				{distortion}
				{chromaticAberration}
				{speed}
				{waviness}
				{frequency}
				{rods}
			/>
		</FragCanvas>
	</div>
</div>
