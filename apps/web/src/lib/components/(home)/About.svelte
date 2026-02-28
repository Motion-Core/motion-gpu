<script lang="ts">
	import Badge from '../ui/Badge.svelte';
	import CodePreview from './CodePreview.svelte';
	import glassPaneSource from '$lib/GlassPane.svelte?raw';
	import glassPaneSceneSource from '$lib/GlassPaneScene.svelte?raw';
	import GlassPane from '$lib/GlassPane.svelte';

	const image = '/sample.jpg';

	const previewFiles = [
		{
			id: 'glass-pane',
			label: 'GlassPane.svelte',
			code: glassPaneSource
		},
		{
			id: 'glass-pane-scene',
			label: 'GlassPaneScene.svelte',
			code: glassPaneSceneSource
		}
	] as const;
</script>

<section class="flex w-full flex-col items-start justify-start bg-card p-4 sm:p-8">
	<div class="flex w-full flex-col items-start justify-center gap-6">
		<Badge>About</Badge>
		<div class="grid w-full grid-cols-3 gap-6">
			<div class="col-span-3 flex w-full flex-col gap-3 sm:col-span-2">
				<h2 class="max-w-2xl text-2xl tracking-tight text-balance sm:text-5xl">
					Build richer visuals with less GPU chaos.
				</h2>
				<p class="max-w-2xl font-fono text-sm text-balance">
					MotionGPU is a Svelte-first WebGPU runtime focused on predictable behavior, readable
					errors, and maintainable shader architecture.
				</p>
				<div class="mt-12 sm:mt-24">
					<CodePreview files={previewFiles} />
				</div>
			</div>
			<div class="col-span-3 overflow-hidden sm:col-span-1">
				<GlassPane
					{image}
					distortion={0.5}
					chromaticAberration={0.005}
					waviness={0.0}
					speed={0.5}
					rods={3}
				/>
			</div>
		</div>
	</div>
</section>
