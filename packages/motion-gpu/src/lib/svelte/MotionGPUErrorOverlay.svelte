<script lang="ts">
	import { onMount } from 'svelte';
	import { createMotionGPUErrorOverlayModel } from '../core/error-overlay-model';
	import type { MotionGPUErrorReport } from '../core/error-report';
	import Portal from './Portal.svelte';

	interface Props {
		report: MotionGPUErrorReport;
	}

	let { report }: Props = $props();
	const model = $derived(createMotionGPUErrorOverlayModel(report));

	const componentId = $props.id();
	const titleId = `${componentId}-title`;
	const descriptionId = `${componentId}-description`;
	const sourceTitleId = `${componentId}-source-title`;
	const focusableSelector =
		'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	let overlayElement = $state<HTMLDivElement | null>(null);
	let dialogElement = $state<HTMLElement | null>(null);

	const getFocusableElements = (): HTMLElement[] => {
		if (!dialogElement) return [];

		return Array.from(dialogElement.querySelectorAll<HTMLElement>(focusableSelector)).filter(
			(element) => element.getAttribute('aria-hidden') !== 'true'
		);
	};

	const handleDialogKeydown = (event: KeyboardEvent): void => {
		if (event.key !== 'Tab' || !dialogElement) return;

		const focusableElements = getFocusableElements();
		if (focusableElements.length === 0) {
			event.preventDefault();
			dialogElement.focus({ preventScroll: true });
			return;
		}

		const firstElement = focusableElements[0]!;
		const lastElement = focusableElements[focusableElements.length - 1]!;
		const activeElement = document.activeElement;
		const focusIsOutsideDialog =
			!(activeElement instanceof Node) || !dialogElement.contains(activeElement);

		if (
			event.shiftKey &&
			(activeElement === firstElement || activeElement === dialogElement || focusIsOutsideDialog)
		) {
			event.preventDefault();
			lastElement.focus();
			return;
		}

		if (
			!event.shiftKey &&
			(activeElement === lastElement || activeElement === dialogElement || focusIsOutsideDialog)
		) {
			event.preventDefault();
			firstElement.focus();
		}
	};

	onMount(() => {
		const previouslyFocused =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const portalRoot = overlayElement?.parentElement;
		const inertStates: Array<{ element: HTMLElement; wasInert: boolean }> = [];

		for (const child of document.body.children) {
			if (!(child instanceof HTMLElement) || child === portalRoot) continue;
			inertStates.push({ element: child, wasInert: child.inert });
			child.inert = true;
		}

		const keepFocusInDialog = (event: FocusEvent) => {
			if (
				!dialogElement ||
				!(event.target instanceof Node) ||
				dialogElement.contains(event.target)
			) {
				return;
			}
			dialogElement.focus({ preventScroll: true });
		};

		document.addEventListener('focusin', keepFocusInDialog);
		queueMicrotask(() => {
			dialogElement?.focus({ preventScroll: true });
		});

		return () => {
			document.removeEventListener('focusin', keepFocusInDialog);
			for (const { element, wasInert } of inertStates) {
				if (element.isConnected) element.inert = wasInert;
			}
			if (previouslyFocused?.isConnected) {
				previouslyFocused.focus({ preventScroll: true });
			}
		};
	});
</script>

{#snippet chevronDownIcon()}
	<svg
		class="motiongpu-error-details-chevron"
		viewBox="0 0 18 18"
		fill="none"
		aria-hidden="true"
		focusable="false"
	>
		<polyline
			points="15.25 6.5 9 12.75 2.75 6.5"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{/snippet}

<Portal>
	<div bind:this={overlayElement} class="motiongpu-error-overlay" role="presentation">
		<div class="motiongpu-error-dialog-shell" role="presentation">
			<div
				bind:this={dialogElement}
				class="motiongpu-error-dialog"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				tabindex="-1"
				data-testid="motiongpu-error"
				onkeydown={handleDialogKeydown}
			>
				<header class="motiongpu-error-header">
					<div class="motiongpu-error-header-top">
						<div class="motiongpu-error-header-copy">
							<h2 id={titleId} class="motiongpu-error-title">{report.title}</h2>
							<p class="motiongpu-error-recoverable">
								Recoverable: <span>{report.recoverable ? 'yes' : 'no'}</span>
							</p>
						</div>
						<div class="motiongpu-error-badges">
							<div class="motiongpu-error-badge-wrap">
								<p class="motiongpu-error-badge motiongpu-error-badge-phase">
									{report.phase}
								</p>
							</div>
							<div class="motiongpu-error-badge-wrap">
								<p class="motiongpu-error-badge motiongpu-error-badge-severity">
									{report.severity}
								</p>
							</div>
						</div>
					</div>
				</header>
				<div id={descriptionId} class="motiongpu-error-body">
					{#if model.displayMessage.length > 0}
						<p class="motiongpu-error-message">{model.displayMessage}</p>
					{/if}
					<p class="motiongpu-error-hint">{report.hint}</p>
				</div>

				{#if report.source}
					<section class="motiongpu-error-source" aria-labelledby={sourceTitleId}>
						<h3 id={sourceTitleId} class="motiongpu-error-source-title">Source</h3>
						<figure class="motiongpu-error-source-frame">
							<figcaption class="motiongpu-error-source-tabs">
								<span class="motiongpu-error-source-tab motiongpu-error-source-tab-active"
									>{report.source.location}{#if report.source.column}, col {report.source
											.column}{/if}</span
								>
								<span class="motiongpu-error-source-tab-spacer" aria-hidden="true"></span>
							</figcaption>

							<div
								class="motiongpu-error-source-snippet"
								role="region"
								aria-label={`Source code from ${report.source.location}`}
							>
								{#each report.source.snippet as snippetLine (`snippet-${snippetLine.number}`)}
									<div
										class="motiongpu-error-source-row"
										class:motiongpu-error-source-row-active={snippetLine.highlight}
									>
										<span class="motiongpu-error-source-line">
											{#if snippetLine.highlight}<span class="motiongpu-sr-only"
													>Error line:
												</span>{/if}{snippetLine.number}
										</span>
										<span class="motiongpu-error-source-code">{snippetLine.code || ' '}</span>
									</div>
								{/each}
							</div>
						</figure>
					</section>
				{/if}

				<div class="motiongpu-error-sections">
					{#if report.details.length > 0}
						<details class="motiongpu-error-details" open>
							<summary>
								{@render chevronDownIcon()}
								<span>{report.source ? 'Additional diagnostics' : 'Technical details'}</span>
							</summary>
							<pre>{report.details.join('\n')}</pre>
						</details>
					{/if}
					{#if report.stack.length > 0}
						<details class="motiongpu-error-details">
							<summary>
								{@render chevronDownIcon()}
								<span>Stack trace</span>
							</summary>
							<pre>{report.stack.join('\n')}</pre>
						</details>
					{/if}
					{#if report.context}
						<details class="motiongpu-error-details">
							<summary>
								{@render chevronDownIcon()}
								<span>Runtime context</span>
							</summary>
							<pre>{model.runtimeContextText}</pre>
						</details>
					{/if}
				</div>
			</div>
		</div>
	</div>
</Portal>

<style>
	.motiongpu-error-overlay {
		--motiongpu-base-hue: var(--base-hue, 265);
		--motiongpu-surface-gap: 0.375rem;
		--motiongpu-color-background-inset: oklch(0.1913 0.0039 var(--motiongpu-base-hue));
		--motiongpu-color-background: oklch(0.235 0.0056 var(--motiongpu-base-hue));
		--motiongpu-color-background-muted: oklch(0.265 0.0073 var(--motiongpu-base-hue));
		--motiongpu-color-foreground: oklch(0.9674 0.0013 var(--motiongpu-base-hue));
		--motiongpu-color-foreground-muted: oklch(0.669 0.0107 var(--motiongpu-base-hue));
		--motiongpu-color-accent: oklch(0.6996 0.181959 44.4414);
		--motiongpu-color-accent-secondary: oklch(0.5096 0.131959 44.4414);
		--motiongpu-color-warning: oklch(0.708 0.18 19.571);
		--motiongpu-color-white-fixed: oklch(1 0 0);
		--motiongpu-shadow-color: oklch(0 0.0013 var(--motiongpu-base-hue));
		--motiongpu-shadow-highlight-color: oklch(1 0.013 var(--motiongpu-base-hue));
		--motiongpu-guide-ink: oklch(from var(--motiongpu-shadow-highlight-color) l c h / 0.08);
		--motiongpu-guide-duotone-ink: var(--motiongpu-shadow-color);
		--motiongpu-guide-duotone-glint: oklch(
			from var(--motiongpu-shadow-highlight-color) l c h / 0.08
		);
		--motiongpu-radius-base: var(--radius-base, 0.275rem);
		--motiongpu-radius-xs: var(--radius-xs, calc(var(--motiongpu-radius-base) * 1));
		--motiongpu-radius-sm: var(--radius-sm, calc(var(--motiongpu-radius-base) * 2));
		--motiongpu-radius-md: var(--radius-md, calc(var(--motiongpu-radius-base) * 3));
		--motiongpu-radius-lg: var(--radius-lg, calc(var(--motiongpu-radius-base) * 4));
		--motiongpu-radius-xl: var(--radius-xl, calc(var(--motiongpu-radius-base) * 6));
		--motiongpu-radius-dialog-inner: calc(
			var(--motiongpu-radius-xl) - var(--motiongpu-surface-gap)
		);
		--motiongpu-radius-surface-inner: calc(
			var(--motiongpu-radius-lg) - var(--motiongpu-surface-gap)
		);
		--motiongpu-shadow-inset:
			0px 1px 3px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.051) inset,
			0px 5px 5px -1px oklch(from var(--motiongpu-shadow-color) l c h / 0.051) inset,
			0px 11px 6px -2px oklch(from var(--motiongpu-shadow-color) l c h / 0.031) inset,
			0px 19px 8px -3px oklch(from var(--motiongpu-shadow-color) l c h / 0.012) inset,
			0px 0px 0px 1px oklch(from var(--motiongpu-shadow-highlight-color) l c h / 0.051) inset,
			0px -1px 0px 0px oklch(from var(--motiongpu-shadow-highlight-color) l c h / 0.122) inset,
			0px 0px 0px 1px oklch(from var(--motiongpu-shadow-color) l c h / 0.071) inset,
			0px 1px 0px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.039) inset;
		--motiongpu-shadow-highlight-inset:
			0px 1px 3px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.051) inset,
			0px 5px 5px -1px oklch(from var(--motiongpu-shadow-color) l c h / 0.051) inset,
			0px 11px 6px -2px oklch(from var(--motiongpu-shadow-color) l c h / 0.031) inset,
			0px 19px 8px -3px oklch(from var(--motiongpu-shadow-color) l c h / 0.012) inset,
			0px 0px 0px 1px oklch(from var(--motiongpu-shadow-highlight-color) l c h / 0.051) inset,
			0px 0px 0px 1px oklch(from var(--motiongpu-shadow-color) l c h / 0.071) inset,
			0px 1px 0px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.039) inset;
		--motiongpu-shadow-md:
			0px 1px 3px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.051),
			0px 5px 5px -1px oklch(from var(--motiongpu-shadow-color) l c h / 0.051),
			0px 11px 6px -2px oklch(from var(--motiongpu-shadow-color) l c h / 0.031),
			0px 19px 8px -3px oklch(from var(--motiongpu-shadow-color) l c h / 0.012),
			0px 0px 0px 1px oklch(from var(--motiongpu-shadow-highlight-color) l c h / 0.051) inset,
			0px 1px 0px 0px oklch(from var(--motiongpu-shadow-highlight-color) l c h / 0.122) inset,
			0px 0px 0px 1px oklch(from var(--motiongpu-shadow-color) l c h / 0.071),
			0px 1px 0px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.039);
		--motiongpu-shadow-2xl:
			0px 13px 29px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.071),
			0px 53px 53px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.059),
			0px 119px 71px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.031),
			0px 211px 85px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.012),
			0px 0px 0px 1px oklch(from var(--motiongpu-shadow-color) l c h / 0.102),
			0px 1px 0px 0px oklch(from var(--motiongpu-shadow-color) l c h / 0.102),
			0px 0px 0px 1px oklch(from var(--motiongpu-shadow-highlight-color) l c h / 0.051) inset,
			0px 1px 0px 0px oklch(from var(--motiongpu-shadow-highlight-color) l c h / 0.122) inset;
		--motiongpu-font-sans: var(--font-sans, 'APK Galeria', ui-sans-serif, system-ui, sans-serif);
		--motiongpu-font-mono: var(
			--font-mono,
			'Berkeley Mono',
			ui-monospace,
			'SFMono-Regular',
			Menlo,
			Consolas,
			monospace
		);

		position: fixed;
		inset: 0;
		z-index: 2147483647;
		display: grid;
		place-items: center;
		padding-block-start: max(clamp(0.75rem, 1.4vw, 1.5rem), env(safe-area-inset-top));
		padding-block-end: max(clamp(0.75rem, 1.4vw, 1.5rem), env(safe-area-inset-bottom));
		padding-inline-start: max(clamp(0.75rem, 1.4vw, 1.5rem), env(safe-area-inset-left));
		padding-inline-end: max(clamp(0.75rem, 1.4vw, 1.5rem), env(safe-area-inset-right));
		overscroll-behavior: contain;
		background: oklch(0 0 0 / 0.8);
		backdrop-filter: blur(10px);
		color: var(--motiongpu-color-foreground);
		color-scheme: dark;
		font-family: var(--motiongpu-font-sans);
		font-size: 0.875rem;
		font-weight: 400;
		line-height: 1.5;
		text-align: start;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	.motiongpu-error-overlay,
	.motiongpu-error-overlay * {
		box-sizing: border-box;
	}

	.motiongpu-error-overlay ::selection {
		background: var(--motiongpu-color-accent);
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	.motiongpu-error-dialog-shell {
		inline-size: min(52rem, 100%);
		max-block-size: min(84dvh, 44rem);
		padding: var(--motiongpu-surface-gap);
		overflow: hidden;
		isolation: isolate;
		border-radius: var(--motiongpu-radius-xl);
		background: var(--motiongpu-color-background-inset);
		box-shadow: var(--motiongpu-shadow-highlight-inset), var(--motiongpu-shadow-2xl);
	}

	.motiongpu-error-dialog {
		inline-size: 100%;
		max-block-size: calc(min(84dvh, 44rem) - (2 * var(--motiongpu-surface-gap)));
		padding: clamp(1rem, 2vw, 1.5rem);
		overflow: auto;
		overscroll-behavior: contain;
		border-radius: var(--motiongpu-radius-dialog-inner);
		outline: none;
		background: var(--motiongpu-color-background);
		color: var(--motiongpu-color-foreground);
		box-shadow: var(--motiongpu-shadow-md);
		scrollbar-color: var(--motiongpu-color-foreground-muted) transparent;
		scrollbar-width: thin;
	}

	.motiongpu-error-header {
		position: relative;
		display: grid;
		gap: 0.75rem;
		padding-block-end: 1.5rem;
	}

	.motiongpu-error-header::after,
	.motiongpu-error-source-tabs::after,
	.motiongpu-error-details pre::before {
		position: absolute;
		inset-inline: 0;
		block-size: 1px;
		content: '';
		background: var(--motiongpu-guide-duotone-ink);
		box-shadow: 0 1px var(--motiongpu-guide-duotone-glint);
	}

	.motiongpu-error-header::after,
	.motiongpu-error-source-tabs::after {
		inset-block-end: 0;
	}

	.motiongpu-error-header-top {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 1rem;
	}

	.motiongpu-error-header-copy {
		display: grid;
		gap: 0.375rem;
		min-inline-size: 0;
	}

	.motiongpu-error-badges {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
		max-inline-size: 100%;
	}

	.motiongpu-error-badge-wrap {
		display: inline-flex;
		align-items: center;
		inline-size: fit-content;
		padding: 0.1875rem;
		border-radius: 9999px;
		background: var(--motiongpu-color-background-inset);
		box-shadow: var(--motiongpu-shadow-inset);
	}

	.motiongpu-error-badge {
		display: inline-flex;
		align-items: center;
		min-block-size: 1.5rem;
		margin: 0;
		padding-inline: 0.625rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.3;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--motiongpu-color-white-fixed);
		box-shadow: var(--motiongpu-shadow-md);
	}

	.motiongpu-error-badge-phase {
		background: linear-gradient(
			180deg,
			var(--motiongpu-color-accent),
			var(--motiongpu-color-accent-secondary)
		);
	}

	.motiongpu-error-badge-severity {
		background: linear-gradient(
			180deg,
			var(--motiongpu-color-warning),
			color-mix(in oklab, var(--motiongpu-color-warning) 70%, var(--motiongpu-color-background) 30%)
		);
	}

	.motiongpu-error-title {
		max-inline-size: 40ch;
		margin: 0;
		font-size: clamp(1.125rem, 1vw + 0.875rem, 1.25rem);
		font-weight: 500;
		line-height: 1.2;
		letter-spacing: -0.02em;
		text-wrap: balance;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-recoverable {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 400;
		line-height: 1.3;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--motiongpu-color-foreground-muted);
	}

	.motiongpu-error-recoverable span {
		font-family: var(--motiongpu-font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-body {
		display: grid;
		gap: 0.75rem;
		margin-block-start: 1.5rem;
	}

	.motiongpu-error-message,
	.motiongpu-error-hint {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 400;
		line-height: 1.5;
		text-wrap: pretty;
		overflow-wrap: break-word;
	}

	.motiongpu-error-message {
		inline-size: 100%;
		padding: 0.75rem 1rem;
		border-inline-start: 2px solid var(--motiongpu-color-warning);
		border-radius: var(--motiongpu-radius-sm);
		background: color-mix(in oklch, var(--motiongpu-color-warning) 10%, transparent);
		color: var(--motiongpu-color-foreground);
		box-shadow: var(--motiongpu-shadow-inset);
	}

	.motiongpu-error-hint {
		max-inline-size: 70ch;
		color: var(--motiongpu-color-foreground-muted);
	}

	.motiongpu-error-source {
		display: grid;
		gap: 0.75rem;
		margin-block-start: 1.5rem;
	}

	.motiongpu-error-source-title {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.4;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--motiongpu-color-foreground-muted);
	}

	.motiongpu-error-source-frame {
		margin: 0;
		padding: var(--motiongpu-surface-gap);
		overflow: hidden;
		isolation: isolate;
		border-radius: var(--motiongpu-radius-lg);
		background: var(--motiongpu-color-background-inset);
		box-shadow: var(--motiongpu-shadow-highlight-inset);
	}

	.motiongpu-error-source-tabs {
		position: relative;
		display: flex;
		align-items: flex-end;
		min-block-size: 2.5rem;
		margin: 0;
		border-start-start-radius: var(--motiongpu-radius-surface-inner);
		border-start-end-radius: var(--motiongpu-radius-surface-inner);
		background: var(--motiongpu-color-background);
		box-shadow: var(--motiongpu-shadow-md);
	}

	.motiongpu-error-source-tab {
		display: inline-flex;
		align-items: center;
		min-inline-size: 0;
		padding: 0.625rem 0.75rem;
		font-family: var(--motiongpu-font-mono);
		font-size: 0.8125rem;
		font-weight: 400;
		line-height: 1.4;
		overflow-wrap: anywhere;
		color: var(--motiongpu-color-foreground-muted);
	}

	.motiongpu-error-source-tab-active {
		position: relative;
		z-index: 1;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-source-tab-spacer {
		flex: 1 1 auto;
	}

	.motiongpu-error-source-snippet {
		display: grid;
		padding-block: 0.5rem;
		overflow: hidden;
		border-end-start-radius: var(--motiongpu-radius-surface-inner);
		border-end-end-radius: var(--motiongpu-radius-surface-inner);
		background: var(--motiongpu-color-background-muted);
		box-shadow: var(--motiongpu-shadow-md);
	}

	.motiongpu-error-source-row {
		position: relative;
		display: grid;
		grid-template-columns: 2.5rem minmax(0, 1fr);
		align-items: start;
		gap: 0.75rem;
		min-block-size: 1.75rem;
		padding: 0.25rem 0.75rem;
	}

	.motiongpu-error-source-row-active {
		background: color-mix(in oklch, var(--motiongpu-color-warning) 10%, transparent);
	}

	.motiongpu-error-source-row-active::before {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		inline-size: 2px;
		content: '';
		background: var(--motiongpu-color-warning);
	}

	.motiongpu-error-source-line,
	.motiongpu-error-source-code {
		font-family: var(--motiongpu-font-mono);
		font-size: 0.8125rem;
		font-weight: 400;
		line-height: 1.5;
	}

	.motiongpu-error-source-line {
		align-self: stretch;
		padding-inline-end: 0.75rem;
		border-inline-end: 1px solid var(--motiongpu-guide-duotone-ink);
		box-shadow: 1px 0 var(--motiongpu-guide-duotone-glint);
		font-variant-numeric: tabular-nums;
		text-align: end;
		color: var(--motiongpu-color-foreground-muted);
	}

	.motiongpu-error-source-code {
		min-inline-size: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-sections {
		display: grid;
		gap: 0.75rem;
		margin-block-start: 1.5rem;
	}

	.motiongpu-error-sections:empty {
		display: none;
	}

	.motiongpu-error-details {
		padding: var(--motiongpu-surface-gap);
		overflow: hidden;
		isolation: isolate;
		border-radius: var(--motiongpu-radius-lg);
		background: var(--motiongpu-color-background-inset);
		box-shadow: var(--motiongpu-shadow-highlight-inset);
	}

	.motiongpu-error-details summary {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-block-size: 2.75rem;
		padding: 0.75rem 1rem;
		border-radius: var(--motiongpu-radius-surface-inner);
		outline: none;
		cursor: pointer;
		list-style: none;
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1.4;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--motiongpu-color-foreground);
		background: var(--motiongpu-color-background);
		box-shadow: var(--motiongpu-shadow-md);
		touch-action: manipulation;
	}

	.motiongpu-error-details summary::-webkit-details-marker {
		display: none;
	}

	.motiongpu-error-details-chevron {
		inline-size: 0.875rem;
		block-size: 0.875rem;
		flex: 0 0 auto;
		opacity: 0.72;
		transform: rotate(-90deg);
		transform-box: view-box;
		transform-origin: 50% 50%;
	}

	.motiongpu-error-details summary:hover {
		background: var(--motiongpu-color-background-muted);
	}

	.motiongpu-error-details summary:focus-visible {
		box-shadow:
			var(--motiongpu-shadow-md),
			inset 0 0 0 2px var(--motiongpu-color-accent);
	}

	.motiongpu-error-details[open] summary {
		border-end-start-radius: 0;
		border-end-end-radius: 0;
	}

	.motiongpu-error-details[open] .motiongpu-error-details-chevron {
		transform: rotate(0deg);
	}

	.motiongpu-error-details pre {
		position: relative;
		min-inline-size: 0;
		margin: 0;
		padding: 1rem;
		border-end-start-radius: var(--motiongpu-radius-surface-inner);
		border-end-end-radius: var(--motiongpu-radius-surface-inner);
		white-space: pre-wrap;
		overflow: auto;
		overflow-wrap: anywhere;
		background: var(--motiongpu-color-background-muted);
		font-family: var(--motiongpu-font-mono);
		font-size: 0.8125rem;
		font-weight: 400;
		line-height: 1.5;
		color: var(--motiongpu-color-foreground);
		scrollbar-color: var(--motiongpu-color-foreground-muted) transparent;
		scrollbar-width: thin;
	}

	.motiongpu-error-details pre::before {
		inset-block-start: 0;
	}

	@media (max-width: 42rem) {
		.motiongpu-error-overlay {
			place-items: stretch;
			padding-block-start: max(0.625rem, env(safe-area-inset-top));
			padding-block-end: max(0.625rem, env(safe-area-inset-bottom));
			padding-inline-start: max(0.625rem, env(safe-area-inset-left));
			padding-inline-end: max(0.625rem, env(safe-area-inset-right));
		}

		.motiongpu-error-dialog-shell {
			align-self: center;
			inline-size: 100%;
		}

		.motiongpu-error-dialog {
			padding: 1rem;
		}

		.motiongpu-error-recoverable {
			white-space: normal;
		}

		.motiongpu-error-source-row {
			grid-template-columns: 2rem minmax(0, 1fr);
			gap: 0.625rem;
			padding-inline: 0.625rem;
		}

		.motiongpu-error-source-line {
			padding-inline-end: 0.625rem;
		}
	}

	@media (max-width: 32rem) {
		.motiongpu-error-header-top {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.75rem;
		}

		.motiongpu-error-badges {
			justify-content: flex-start;
		}
	}

	@media (forced-colors: active) {
		.motiongpu-error-details summary:focus-visible {
			outline: 2px solid Highlight;
			outline-offset: -2px;
		}
	}
</style>
