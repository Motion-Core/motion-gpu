<script lang="ts">
	import Scene from './GlassPaneScene.svelte';
	import { cn } from './utils/cn';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/**
		 * The image source URL.
		 */
		image: string;
		/**
		 * Additional CSS classes for the container.
		 */
		class?: string;
		/**
		 * Glass field rotation in degrees.
		 * @default 0
		 */
		rotation?: number;
		/**
		 * Strength of the glass refraction.
		 * @default 1
		 */
		refraction?: number;
		/**
		 * Amount of chromatic aberration (color splitting).
		 * @default 1
		 */
		chromaticAberration?: number;
		/**
		 * Width of the diagonal glass panels.
		 * @default 0.82
		 */
		panelWidth?: number;
		/**
		 * Frequency of the panel wave.
		 * @default 0.0
		 */
		waveFrequency?: number;
		/**
		 * Amplitude of the panel wave.
		 * @default 0.0
		 */
		waveAmplitude?: number;
		/**
		 * Animation speed multiplier.
		 * @default 0.65
		 */
		speed?: number;
	};

	let {
		image,
		class: className = '',
		rotation = 0,
		refraction = 1,
		chromaticAberration = 1,
		panelWidth = 0.82,
		waveFrequency = 0.0,
		waveAmplitude = 0.0,
		speed = 0.65,
		...rest
	}: Props = $props();
</script>

<div class={cn('relative h-full w-full overflow-hidden', className)} {...rest}>
	<div class="absolute inset-0 z-0">
		<Scene
			{image}
			{rotation}
			{refraction}
			{chromaticAberration}
			{panelWidth}
			{waveFrequency}
			{waveAmplitude}
			{speed}
		/>
	</div>
</div>
