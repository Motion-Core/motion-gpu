<script lang="ts">
	import { fly } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import {
		contentUiDefaults,
		resolveAssistantUrls,
		type SectionUiConfig
	} from '$lib/config/content-ui';
	import { portal } from '$lib/utils/use-portal';
	import { copyToClipboard } from '$lib/utils/copy';
	import { AppCheckIcon, AppGitHubIcon, AppMoreHorizontalIcon } from '$lib/components/icons';
	import { onMount, tick } from 'svelte';
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

	let copyState = $state<'idle' | 'copying' | 'success' | 'error'>('idle');
	let isDropdownOpen = $state(false);
	let dropdownStyle = $state('');
	const dropdownId = 'mobile-doc-actions-menu';
	const dropdownTriggerId = `${dropdownId}-trigger`;
	const opensInNewTabLabel = '(opens in a new tab)';
	const canUseWindow = typeof window !== 'undefined';
	const canUseDocument = typeof document !== 'undefined';

	const assistantUrls = $derived(resolveAssistantUrls(pageActionsConfig, rawUrl));
	const chatGptUrl = $derived(assistantUrls.chatGptUrl);
	const claudeUrl = $derived(assistantUrls.claudeUrl);
	const canShowCopy = $derived(pageActionsConfig.showCopyMarkdown && Boolean(rawPath));
	const canShowRepository = $derived(pageActionsConfig.showRepositoryLink && Boolean(githubUrl));
	const hasMenuActions = $derived(canShowRepository || Boolean(chatGptUrl) || Boolean(claudeUrl));
	const hasActions = $derived(canShowCopy || hasMenuActions);
	const prefetchedContentPromise = $derived.by(() => {
		if (!canShowCopy || !rawPath || !canUseWindow) {
			return Promise.resolve<string | null>(null);
		}
		return fetchPrefetchedContent(rawPath);
	});

	const copyLabel = $derived(
		copyState === 'copying'
			? pageActionsConfig.copyLabels.copying
			: copyState === 'success'
				? pageActionsConfig.copyLabels.success
				: copyState === 'error'
					? pageActionsConfig.copyLabels.error
					: pageActionsConfig.copyLabels.mobileIdle
	);

	async function fetchPrefetchedContent(path: string) {
		try {
			const response = await fetch(path);
			if (response.ok) {
				return await response.text();
			}
		} catch (e) {
			console.warn('Failed to prefetch document content:', e);
		}
		return null;
	}

	async function handleCopy() {
		if (!canShowCopy || copyState === 'copying' || copyState === 'success') return;

		copyState = 'copying';

		try {
			let content = await prefetchedContentPromise;
			if (!content) {
				if (!rawPath) throw new Error('No path to fetch');
				const response = await fetch(rawPath);
				if (!response.ok) throw new Error('Failed to load document');
				content = await response.text();
			}

			await copyToClipboard(content);
			copyState = 'success';
		} catch (e) {
			console.error('Copy failed:', e);
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

	function toggleDropdown() {
		if (!hasMenuActions) return;
		if (isDropdownOpen) {
			closeDropdown({ restoreFocus: true });
			return;
		}
		isDropdownOpen = true;
		updatePosition();
		void tick().then(() => {
			const items = getMenuItems();
			if (items.length > 0) items[0].focus();
		});
	}

	function closeDropdown(options?: { restoreFocus?: boolean }) {
		isDropdownOpen = false;
		if (options?.restoreFocus) {
			getTriggerElement()?.focus();
		}
	}

	function getDropdownElement() {
		if (!canUseDocument) return null;
		const node = document.getElementById(dropdownId);
		return node instanceof HTMLDivElement ? node : null;
	}

	function getTriggerElement() {
		if (!canUseDocument) return null;
		const node = document.getElementById(dropdownTriggerId);
		return node instanceof HTMLButtonElement ? node : null;
	}

	function getMenuItems() {
		const dropdown = getDropdownElement();
		if (!dropdown) return [];
		return Array.from(dropdown.querySelectorAll<HTMLElement>('[role="menuitem"]'));
	}

	function handleDropdownKeydown(event: KeyboardEvent) {
		if (!isDropdownOpen) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			closeDropdown({ restoreFocus: true });
			return;
		}

		const items = getMenuItems();
		if (items.length === 0) return;

		const activeElement =
			canUseDocument && document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const activeIndex = activeElement ? items.indexOf(activeElement) : -1;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % items.length : 0;
			items[nextIndex]?.focus();
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			const nextIndex =
				activeIndex >= 0 ? (activeIndex - 1 + items.length) % items.length : items.length - 1;
			items[nextIndex]?.focus();
			return;
		}

		if (event.key === 'Tab') {
			closeDropdown();
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const dropdown = getDropdownElement();
		const trigger = getTriggerElement();

		if (
			isDropdownOpen &&
			dropdown &&
			!dropdown.contains(event.target as Node) &&
			trigger &&
			!trigger.contains(event.target as Node)
		) {
			closeDropdown();
		}
	}

	function updatePosition() {
		const trigger = getTriggerElement();
		if (!trigger || !canUseWindow) return;
		const rect = trigger.getBoundingClientRect();
		dropdownStyle = `top: ${(rect.bottom + 8).toString()}px; right: ${(window.innerWidth - rect.right).toString()}px; position: fixed;`;
	}

	onMount(() => {
		if (!canUseWindow) return;

		const handleScrollOrResize = () => {
			if (!isDropdownOpen) return;
			updatePosition();
		};

		const handleWindowClick = (event: MouseEvent) => {
			if (!isDropdownOpen) return;
			handleClickOutside(event);
		};

		const handleWindowKeydown = (event: KeyboardEvent) => {
			if (!isDropdownOpen) return;
			handleDropdownKeydown(event);
		};

		window.addEventListener('click', handleWindowClick);
		window.addEventListener('scroll', handleScrollOrResize, true);
		window.addEventListener('resize', handleScrollOrResize);
		window.addEventListener('keydown', handleWindowKeydown);

		return () => {
			window.removeEventListener('click', handleWindowClick);
			window.removeEventListener('scroll', handleScrollOrResize, true);
			window.removeEventListener('resize', handleScrollOrResize);
			window.removeEventListener('keydown', handleWindowKeydown);
		};
	});

	const buttonClass =
		"focus-ring focus-outline hit-target card relative inline-flex h-9 w-full font-medium shrink-0 items-center justify-center gap-2 rounded-sm bg-background px-4 py-2 text-sm whitespace-nowrap text-foreground transition-[background-color,box-shadow] duration-150 ease-out outline-none hover:bg-background-muted disabled:pointer-events-none disabled:opacity-50 has-[>svg]:px-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 flex-1 motion-reduce:transition-none";
</script>

{#if hasActions}
	<div class="relative z-20 mt-8 flex w-full gap-2 lg:hidden">
		{#if canShowCopy}
			<div class="card-outer w-full rounded-md bg-background-inset p-1.5">
				<button
					type="button"
					onclick={() => void handleCopy()}
					aria-live="polite"
					aria-disabled={copyState === 'success'}
					class={buttonClass}
				>
					<span
						class="grid place-items-center overflow-hidden"
						style="grid-template-areas: 'content';"
					>
						{#key copyState}
							<span
								class="flex items-center gap-2 font-medium tracking-normal text-foreground will-change-transform motion-reduce:will-change-auto"
								style="grid-area: content;"
								in:fly={{ y: motionDistance(20), duration: motionDuration(300), easing: backOut }}
								out:fly={{
									y: motionDistance(-20),
									duration: motionDuration(200),
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
			</div>
		{/if}

		{#if hasMenuActions}
			<div class="card-outer relative rounded-md bg-background-inset p-1.5">
				<button
					id={dropdownTriggerId}
					type="button"
					onclick={toggleDropdown}
					class={buttonClass}
					aria-label={pageActionsConfig.moreActionsAriaLabel}
					aria-haspopup="menu"
					aria-controls={dropdownId}
					aria-expanded={isDropdownOpen}
				>
					<AppMoreHorizontalIcon class="size-4" />
				</button>

				{#if isDropdownOpen}
					<div
						use:portal={'main'}
						id={dropdownId}
						style={dropdownStyle}
						class="z-50 flex w-48 origin-top-right flex-col gap-0.5 rounded-md bg-background p-1 card"
						role="menu"
						aria-label={pageActionsConfig.moreActionsAriaLabel}
						in:fly={{ y: motionDistance(-5), duration: motionDuration(200), easing: backOut }}
						out:fly={{ y: motionDistance(-5), duration: motionDuration(150), easing: backOut }}
					>
						{#if canShowRepository}
							<a
								href={githubUrl}
								target="_blank"
								rel="external"
								role="menuitem"
								class="focus-ring group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium tracking-normal text-foreground-muted transition-[color,background-color,box-shadow] outline-none hover:bg-background-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset motion-reduce:transition-none"
							>
								<AppGitHubIcon class="size-4 flex-none" />
								{pageActionsConfig.repositoryLinkLabel}
								<span class="sr-only">{opensInNewTabLabel}</span>
							</a>
						{/if}

						{#if chatGptUrl}
							<a
								href={chatGptUrl}
								target="_blank"
								rel="external"
								role="menuitem"
								class="focus-ring group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium tracking-normal text-foreground-muted transition-[color,background-color,box-shadow] outline-none hover:bg-background-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset motion-reduce:transition-none"
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
								{pageActionsConfig.assistants.chatgpt.label}
								<span class="sr-only">{opensInNewTabLabel}</span>
							</a>
						{/if}

						{#if claudeUrl}
							<a
								href={claudeUrl}
								target="_blank"
								rel="external"
								role="menuitem"
								class="focus-ring group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium tracking-normal text-foreground-muted transition-[color,background-color,box-shadow] outline-none hover:bg-background-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset motion-reduce:transition-none"
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
								{pageActionsConfig.assistants.claude.label}
								<span class="sr-only">{opensInNewTabLabel}</span>
							</a>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
