<script lang="ts">
	import Scene from './GlassPaneScene.svelte';
	import { cn } from './utils/cn';
	import type { ColorRepresentation } from 'ogl';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Color used at the top and center of the gradient. Accepts CSS colors and custom properties. */
		backgroundColor?: ColorRepresentation;
		/** Saturated color used for the lower glow. */
		accentColor?: ColorRepresentation;
		class?: string;
		rotation?: number;
		refraction?: number;
		chromaticAberration?: number;
		panelWidth?: number;
		waveFrequency?: number;
		waveAmplitude?: number;
		speed?: number;
	};

	let {
		backgroundColor = 'var(--background-inset)',
		accentColor = 'var(--accent)',
		class: className = '',
		rotation = 0,
		refraction = 1,
		chromaticAberration = 1,
		panelWidth = 0.82,
		waveFrequency = 0,
		waveAmplitude = 0,
		speed = 0.65,
		...rest
	}: Props = $props();
</script>

<div class={cn('relative h-full w-full overflow-hidden', className)} {...rest}>
	<div class="absolute inset-0 z-0">
		<Scene
			gradient
			{backgroundColor}
			{accentColor}
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
