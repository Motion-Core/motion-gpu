<script lang="ts">
	import { FragCanvas } from '@motion-core/motion-gpu';
	import GlassPaneScene, { glassPaneMaterial } from './GlassPaneScene.svelte';
	import type { ComponentProps } from 'svelte';
	import { cn } from './utils/cn';

	type SceneProps = ComponentProps<typeof GlassPaneScene>;

	interface Props {
		/**
		 * The image source URL.
		 */
		image: SceneProps['image'];
		/**
		 * Additional CSS classes for the container.
		 */
		class?: string;
		/**
		 * Strength of the refraction/distortion effect.
		 * @default 1.0
		 */
		distortion?: SceneProps['distortion'];
		/**
		 * Amount of chromatic aberration (color splitting).
		 * @default 0.005
		 */
		chromaticAberration?: SceneProps['chromaticAberration'];
		/**
		 * Speed of the wave animation.
		 * @default 1.0
		 */
		speed?: SceneProps['speed'];
		/**
		 * Amplitude of the wave distortion.
		 * @default 0.05
		 */
		waviness?: SceneProps['waviness'];
		/**
		 * Frequency of the wave distortion.
		 * @default 6.0
		 */
		frequency?: SceneProps['frequency'];
		/**
		 * Number of rods in the glass pane.
		 * @default 5.0
		 */
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
</script>

<div class={cn('relative h-full w-full overflow-hidden', className)} {...rest}>
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
