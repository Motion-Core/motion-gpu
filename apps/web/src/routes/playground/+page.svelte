<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { frameworkStore, type Framework } from '$lib/stores/framework.svelte';

	const getPlaygroundParamsFromLocation = () => {
		if (typeof window === 'undefined') return null;
		const params = new URLSearchParams(window.location.search);
		return {
			demoId: params.get('demo'),
			framework: params.get('framework')
		};
	};

	const syncLocationFromController = () => {
		if (typeof window === 'undefined' || !controller) return;
		const nextUrl = new URL(window.location.href);
		nextUrl.searchParams.set('demo', controller.activeDemoId);
		nextUrl.searchParams.set('framework', controller.activeFramework);
		window.history.replaceState(window.history.state, '', nextUrl);
	};

	let PlaygroundView = $state<(typeof import('./PlaygroundView.svelte'))['default'] | null>(null);
	let controller = $state<ReturnType<
		(typeof import('./playground-controller.svelte'))['createPlaygroundController']
	> | null>(null);

	const selectDemo = (demoId: string) => {
		if (!controller) return;
		controller.switchDemo(demoId);
		syncLocationFromController();
	};
	const selectFramework = (framework: string) => {
		if (!controller) return;
		controller.switchFramework(framework);
		frameworkStore.active = controller.activeFramework as Framework;
		syncLocationFromController();
	};
	const handleEditorHostChange = (host: HTMLDivElement | null) => {
		if (!controller) return;
		controller.setEditorHost(host);
	};

	const handlePreviewFrameChange = (frame: HTMLIFrameElement | null) => {
		if (!controller) return;
		controller.setPreviewFrame(frame);
	};

	onMount(() => {
		let mounted = true;
		let removePopState: (() => void) | null = null;
		let disposeController: (() => void) | undefined;

		void (async () => {
			const [{ default: LoadedPlaygroundView }, { createPlaygroundController }] = await Promise.all(
				[import('./PlaygroundView.svelte'), import('./playground-controller.svelte')]
			);
			if (!mounted) return;

			PlaygroundView = LoadedPlaygroundView;
			const params = getPlaygroundParamsFromLocation();
			controller = createPlaygroundController(
				params?.demoId,
				params?.framework ?? frameworkStore.active
			);
			await tick();
			if (!mounted || !controller) return;
			disposeController = controller.mount();
			frameworkStore.active = controller.activeFramework as Framework;
			syncLocationFromController();

			const onPopState = () => {
				const nextParams = getPlaygroundParamsFromLocation();
				controller?.switchFramework(nextParams?.framework ?? frameworkStore.active);
				controller?.switchDemo(nextParams?.demoId);
				if (controller) {
					frameworkStore.active = controller.activeFramework as Framework;
				}
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
		onSelectFramework={selectFramework}
		onEditorHostChange={handleEditorHostChange}
		onPreviewFrameChange={handlePreviewFrameChange}
	/>
{/if}
