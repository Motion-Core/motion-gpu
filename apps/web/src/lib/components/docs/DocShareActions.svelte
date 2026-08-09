<script lang="ts">
	import { fly } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import {
		contentUiDefaults,
		resolveAssistantUrls,
		type SectionUiConfig
	} from '$lib/config/content-ui';
	import { copyToClipboard } from '$lib/utils/copy';
	import { AppCheckIcon, AppExternalLinkIcon, AppGitHubIcon } from '$lib/components/icons';
	import { motionDuration, motionDistance } from '$lib/utils/motion';

	type Props = {
		rawPath?: string | null;
		rawUrl?: string | null;
		githubUrl?: string | null;
		pageActionsConfig?: SectionUiConfig['pageActions'];
	};

	let {
		rawPath,
		rawUrl,
		githubUrl,
		pageActionsConfig = contentUiDefaults.pageActions
	}: Props = $props();

	const opensInNewTabLabel = '(opens in a new tab)';

	let actionsElement = $state<HTMLDivElement | null>(null);
	let hoverIndicatorTop = $state(0);
	let hoverIndicatorHeight = $state(0);
	let hoverIndicatorVisible = $state(false);
	let hoveredElement: HTMLElement | null = null;

	type CopyState = 'idle' | 'copying' | 'success' | 'error';
	let copyState = $state<CopyState>('idle');

	const assistantUrls = $derived(resolveAssistantUrls(pageActionsConfig, rawUrl));
	const chatGptUrl = $derived(assistantUrls.chatGptUrl);
	const claudeUrl = $derived(assistantUrls.claudeUrl);
	const canShowCopy = $derived(pageActionsConfig.showCopyMarkdown && Boolean(rawPath));
	const canShowRepository = $derived(pageActionsConfig.showRepositoryLink && Boolean(githubUrl));
	const hasActions = $derived(
		canShowCopy || canShowRepository || Boolean(chatGptUrl) || Boolean(claudeUrl)
	);
	const actionItemClass =
		'focus-ring relative z-10 flex items-center gap-2 rounded-sm px-3 py-1.5 text-left font-medium tracking-normal text-foreground-muted transition-[color,box-shadow] duration-150 ease-out outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent motion-reduce:transition-none';

	const copyLabel = $derived(
		copyState === 'copying'
			? pageActionsConfig.copyLabels.copying
			: copyState === 'success'
				? pageActionsConfig.copyLabels.success
				: copyState === 'error'
					? pageActionsConfig.copyLabels.error
					: pageActionsConfig.copyLabels.desktopIdle
	);

	function showHoverIndicator(node: HTMLElement) {
		if (!actionsElement) return;

		hoveredElement = node;
		const actionsRect = actionsElement.getBoundingClientRect();
		const nodeRect = node.getBoundingClientRect();

		hoverIndicatorTop = nodeRect.top - actionsRect.top;
		hoverIndicatorHeight = nodeRect.height;
		hoverIndicatorVisible = true;
	}

	function hideHoverIndicator() {
		hoveredElement = null;
		hoverIndicatorVisible = false;
	}

	function restoreHoverIndicator() {
		if (typeof document === 'undefined' || !actionsElement) return;

		const focusedElement =
			document.activeElement instanceof HTMLElement &&
			actionsElement.contains(document.activeElement)
				? document.activeElement
				: null;
		const hoveredTarget =
			hoveredElement?.isConnected &&
			actionsElement.contains(hoveredElement) &&
			hoveredElement.matches(':hover')
				? hoveredElement
				: Array.from(actionsElement.querySelectorAll<HTMLElement>('a[href], button')).find((node) =>
						node.matches(':hover')
					);
		const target = hoveredTarget ?? focusedElement;

		if (target) {
			showHoverIndicator(target);
		}
	}

	function handleActionsFocusOut(event: FocusEvent) {
		if (!actionsElement) return;
		if (event.relatedTarget instanceof Node && actionsElement.contains(event.relatedTarget)) return;
		hideHoverIndicator();
	}

	async function handleCopy() {
		if (!canShowCopy || !rawPath || copyState === 'copying' || copyState === 'success') return;

		copyState = 'copying';

		try {
			const response = await fetch(rawPath);
			if (!response.ok) throw new Error('Failed to load document');
			const content = await response.text();
			await copyToClipboard(content);
			copyState = 'success';
		} catch {
			copyState = 'error';
		}
	}

	// Reset copy state back to idle after 2 seconds
	$effect(() => {
		if (copyState !== 'success' && copyState !== 'error') return;
		const t = setTimeout(() => {
			copyState = 'idle';
		}, 2000);
		return () => {
			clearTimeout(t);
		};
	});

	$effect(() => {
		if (hasActions) {
			restoreHoverIndicator();
		}
	});
</script>

{#if hasActions}
	<div class="mt-auto">
		<div
			class="doc-share-actions relative flex flex-col gap-1 text-sm"
			bind:this={actionsElement}
			role="group"
			aria-label="Document actions"
			onmouseleave={hideHoverIndicator}
			onfocusout={handleActionsFocusOut}
			style={`
				--doc-share-hover-top: ${hoverIndicatorTop.toString()}px;
				--doc-share-hover-height: ${hoverIndicatorHeight.toString()}px;
				--doc-share-hover-opacity: ${hoverIndicatorVisible ? '1' : '0'};
			`}
		>
			{#if canShowCopy}
				<button
					type="button"
					onclick={() => void handleCopy()}
					onmouseenter={(event) => {
						showHoverIndicator(event.currentTarget);
					}}
					onfocus={(event) => {
						showHoverIndicator(event.currentTarget);
					}}
					aria-live="polite"
					aria-disabled={copyState === 'success'}
					class={`${actionItemClass} overflow-hidden`}
				>
					<span class="grid" style="grid-template-areas: 'content';">
						{#key copyState}
							<span
								class="flex items-center gap-2"
								style="grid-area: content;"
								in:fly={{ y: motionDistance(20), duration: motionDuration(450), easing: backOut }}
								out:fly={{
									y: motionDistance(-20),
									duration: motionDuration(300),
									easing: backOut
								}}
							>
								{#if copyState === 'success'}
									<AppCheckIcon class="size-4 flex-none" />
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="18px"
										height="18px"
										viewBox="0 0 18 18"
										aria-hidden="true"
										class="flex-none"
										class:text-warning={copyState === 'error'}
									>
										<rect
											x=".75"
											y="3.75"
											width="16.5"
											height="10.5"
											rx="2"
											ry="2"
											fill="none"
											stroke="currentColor"
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="1.5"
										/>
										<polyline
											points="8.75 11.25 8.75 6.75 8.356 6.75 6.25 9.5 4.144 6.75 3.75 6.75 3.75 11.25"
											fill="none"
											stroke="currentColor"
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="1.5"
											data-color="color-2"
										/>
										<polyline
											points="11.5 9.5 13.25 11.25 15 9.5"
											fill="none"
											stroke="currentColor"
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="1.5"
											data-color="color-2"
										/>
										<line
											x1="13.25"
											y1="11.25"
											x2="13.25"
											y2="6.75"
											fill="none"
											stroke="currentColor"
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="1.5"
											data-color="color-2"
										/>
									</svg>
								{/if}
								<span>{copyLabel}</span>
							</span>
						{/key}
					</span>
				</button>
			{/if}

			{#if canShowRepository}
				<a
					class={actionItemClass}
					href={githubUrl}
					target="_blank"
					rel="external"
					onmouseenter={(event) => {
						showHoverIndicator(event.currentTarget);
					}}
					onfocus={(event) => {
						showHoverIndicator(event.currentTarget);
					}}
				>
					<AppGitHubIcon class="size-4 flex-none" />
					<span>{pageActionsConfig.repositoryLinkLabel}</span>
					<AppExternalLinkIcon class="ml-auto size-4 flex-none" />
					<span class="sr-only">{opensInNewTabLabel}</span>
				</a>
			{/if}

			{#if chatGptUrl}
				<a
					class={actionItemClass}
					href={chatGptUrl}
					target="_blank"
					rel="external"
					onmouseenter={(event) => {
						showHoverIndicator(event.currentTarget);
					}}
					onfocus={(event) => {
						showHoverIndicator(event.currentTarget);
					}}
				>
					<svg
						role="img"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
						class="size-4 flex-none"
					>
						<title>OpenAI</title>
						<path
							d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
						/>
					</svg>
					<span>{pageActionsConfig.assistants.chatgpt.label}</span>
					<AppExternalLinkIcon class="ml-auto size-4 flex-none" />
					<span class="sr-only">{opensInNewTabLabel}</span>
				</a>
			{/if}

			{#if claudeUrl}
				<a
					class={actionItemClass}
					href={claudeUrl}
					target="_blank"
					rel="external"
					onmouseenter={(event) => {
						showHoverIndicator(event.currentTarget);
					}}
					onfocus={(event) => {
						showHoverIndicator(event.currentTarget);
					}}
				>
					<svg
						role="img"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
						class="size-4 flex-none"
					>
						<title>Anthropic</title>
						<path
							d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"
						/>
					</svg>
					<span>{pageActionsConfig.assistants.claude.label}</span>
					<AppExternalLinkIcon class="ml-auto size-4 flex-none" />
					<span class="sr-only">{opensInNewTabLabel}</span>
				</a>
			{/if}
		</div>
	</div>
{/if}

<style>
	.doc-share-actions::before {
		content: '';
		position: absolute;
		inset-inline: 0px;
		top: 0;
		height: var(--doc-share-hover-height);
		border-radius: var(--radius-sm);
		background: var(--color-background-muted);
		opacity: var(--doc-share-hover-opacity);
		pointer-events: none;
		transform: translateY(var(--doc-share-hover-top));
		transition:
			transform 150ms ease-out,
			height 150ms ease-out,
			opacity 150ms ease-out;
		will-change: transform, height, opacity;
		z-index: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.doc-share-actions::before {
			transition: none;
			will-change: auto;
		}
	}
</style>
