<script lang="ts">
	import { page } from '$app/state';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	const siteName = 'MotionGPU';
	const description =
		'MotionGPU is a Svelte-first WebGPU runtime with strict material contracts, deterministic frame scheduling, and composable render pipelines.';
	const keywords =
		'svelte, webgpu, gpu, shader, graphics, postprocessing, realtime rendering, motiongpu';

	const title = $derived(
		page.url.pathname.startsWith('/docs')
			? `Docs | ${siteName}`
			: `${siteName} - Svelte-first WebGPU Runtime`
	);
	const canonicalUrl = $derived(`${page.url.origin}${page.url.pathname}`);
	const socialImageUrl = $derived(`${page.url.origin}/sample.jpg`);

	let { children } = $props();
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta name="keywords" content={keywords} />
	<meta name="application-name" content={siteName} />
	<meta name="apple-mobile-web-app-title" content={siteName} />
	<meta name="robots" content="index,follow,max-image-preview:large" />
	<meta name="format-detection" content="telephone=no" />
	<meta name="theme-color" content="#efefef" />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={siteName} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content={socialImageUrl} />
	<meta property="og:image:alt" content="MotionGPU code and realtime WebGPU visual preview" />
	<meta property="og:locale" content="en_US" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={socialImageUrl} />

	<link rel="canonical" href={canonicalUrl} />
	<link rel="icon" href={favicon} />
</svelte:head>
{@render children()}
