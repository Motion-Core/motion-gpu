<script lang="ts">
	import { onMount, tick } from 'svelte';

	const getDemoIdFromLocation = () => {
		if (typeof window === 'undefined') return null;
		return new URLSearchParams(window.location.search).get('demo');
	};

	let PlaygroundView = $state<(typeof import('./PlaygroundView.svelte'))['default'] | null>(null);
	let controller = $state<
		ReturnType<(typeof import('./playground-controller.svelte'))['createPlaygroundController']> | null
	>(null);

	const selectDemo = (demoId: string) => {
		if (!controller) return;
		controller.switchDemo(demoId);
		if (typeof window === 'undefined') return;
		const nextUrl = new URL(window.location.href);
		nextUrl.searchParams.set('demo', controller.activeDemoId);
		window.history.replaceState(window.history.state, '', nextUrl);
	};
	const handleEditorHostChange = (host: HTMLDivElement | null) => {
		if (!controller) return;
		controller.editorHost = host;
	};

	onMount(() => {
		let mounted = true;
		let removePopState: (() => void) | null = null;
		let disposeController: (() => void) | undefined;

		void (async () => {
			const [{ default: LoadedPlaygroundView }, { createPlaygroundController }] = await Promise.all([
				import('./PlaygroundView.svelte'),
				import('./playground-controller.svelte')
			]);
			if (!mounted) return;

			PlaygroundView = LoadedPlaygroundView;
			controller = createPlaygroundController(getDemoIdFromLocation());
			await tick();
			if (!mounted || !controller) return;
			disposeController = controller.mount();

			const onPopState = () => {
				controller?.switchDemo(getDemoIdFromLocation());
			};
			window.addEventListener('popstate', onPopState);
			removePopState = () => window.removeEventListener('popstate', onPopState);
		})();

		return () => {
			mounted = false;
			removePopState?.();
			disposeController?.();
		};
	});
</script>

{#if PlaygroundView && controller}
	<PlaygroundView
		{controller}
		onSelectDemo={selectDemo}
		onEditorHostChange={handleEditorHostChange}
	/>
{/if}
