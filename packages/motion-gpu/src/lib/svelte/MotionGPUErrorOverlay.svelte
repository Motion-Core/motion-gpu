<script lang="ts">
	import { onMount } from 'svelte';
	import '../motion-gpu.css';
	import { createMotionGPUErrorOverlayModel } from '../core/error-overlay-model';
	import { registerErrorOverlay } from '../core/error-overlay-stack';
	import type { MotionGPUErrorReport } from '../core/error-report';
	import Portal from './Portal.svelte';

	interface Props {
		report: MotionGPUErrorReport;
		onDismiss: () => void;
	}

	let { report, onDismiss }: Props = $props();
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
		const portalRoot = overlayElement?.parentElement;
		if (!dialogElement || !portalRoot) return;

		return registerErrorOverlay({ dialog: dialogElement, portalRoot, onDismiss });
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
