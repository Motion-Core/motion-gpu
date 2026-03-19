<script lang="ts">
	import type { MotionGPUErrorReport } from '../core/error-report';
	import Portal from './Portal.svelte';

	interface Props {
		report: MotionGPUErrorReport;
	}

	let { report }: Props = $props();

	const normalizeErrorText = (value: string): string => {
		return value
			.trim()
			.replace(/[.:!]+$/g, '')
			.toLowerCase();
	};

	const shouldShowErrorMessage = (value: MotionGPUErrorReport): boolean => {
		return normalizeErrorText(value.message) !== normalizeErrorText(value.title);
	};
</script>

<Portal>
	<div class="motiongpu-error-overlay" role="presentation">
		<section
			class="motiongpu-error-dialog"
			role="alertdialog"
			aria-live="assertive"
			aria-modal="true"
			data-testid="motiongpu-error"
		>
			<header class="motiongpu-error-header">
				<div class="motiongpu-error-badge-wrap">
					<p class="motiongpu-error-phase">
						{report.phase}
					</p>
				</div>
				<h2 class="motiongpu-error-title">{report.title}</h2>
			</header>
			<div class="motiongpu-error-body">
				{#if shouldShowErrorMessage(report)}
					<p class="motiongpu-error-message">{report.message}</p>
				{/if}
				<p class="motiongpu-error-hint">{report.hint}</p>
			</div>

			{#if report.source}
				<section class="motiongpu-error-source" aria-label="Source">
					<h3 class="motiongpu-error-source-title">Source</h3>
					<div class="motiongpu-error-source-frame" role="presentation">
						<div class="motiongpu-error-source-tabs" role="tablist" aria-label="Source files">
							<span
								class="motiongpu-error-source-tab motiongpu-error-source-tab-active"
								role="tab"
								aria-selected="true"
								>{report.source.location}{#if report.source.column}, col {report.source
										.column}{/if}</span
							>
							<span class="motiongpu-error-source-tab-spacer" aria-hidden="true"></span>
						</div>

						<div class="motiongpu-error-source-snippet">
							{#each report.source.snippet as snippetLine (`snippet-${snippetLine.number}`)}
								<div
									class="motiongpu-error-source-row"
									class:motiongpu-error-source-row-active={snippetLine.highlight}
								>
									<span class="motiongpu-error-source-line">{snippetLine.number}</span>
									<span class="motiongpu-error-source-code">{snippetLine.code || ' '}</span>
								</div>
							{/each}
						</div>
					</div>
				</section>
			{/if}

			<div class="motiongpu-error-sections">
				{#if report.details.length > 0}
					<details class="motiongpu-error-details" open>
						<summary>{report.source ? 'Additional diagnostics' : 'Technical details'}</summary>
						<pre>{report.details.join('\n')}</pre>
					</details>
				{/if}
				{#if report.stack.length > 0}
					<details class="motiongpu-error-details">
						<summary>Stack trace</summary>
						<pre>{report.stack.join('\n')}</pre>
					</details>
				{/if}
			</div>
		</section>
	</div>
</Portal>

<style>
	.motiongpu-error-overlay {
		--motiongpu-color-background: var(--color-background, #ffffff);
		--motiongpu-color-background-muted: var(--color-background-inset, #f6f6f7);
		--motiongpu-color-foreground: var(--color-foreground, #262626);
		--motiongpu-color-foreground-muted: var(--color-foreground-muted, rgba(38, 38, 38, 0.64));
		--motiongpu-color-card: var(--color-background, #ffffff);
		--motiongpu-color-accent: var(--color-accent, #ff6900);
		--motiongpu-color-accent-secondary: var(--color-accent-secondary, #bd4d00);
		--motiongpu-color-border: var(--color-border, rgba(107, 107, 107, 0.2));
		--motiongpu-shadow-card: var(
			--shadow-2xl,
			0px 1px 1px -0.5px rgba(0, 0, 0, 0.06),
			0px 3px 3px -1.5px rgba(0, 0, 0, 0.06),
			0px 6px 6px -3px rgba(0, 0, 0, 0.06),
			0px 12px 12px -6px rgba(0, 0, 0, 0.06),
			0px 24px 24px -12px rgba(0, 0, 0, 0.05),
			0px 48px 48px -24px rgba(0, 0, 0, 0.06)
		);
		--motiongpu-radius-md: var(--radius-md, 0.5rem);
		--motiongpu-radius-lg: var(--radius-lg, 0.75rem);
		--motiongpu-radius-xl: var(--radius-xl, 1rem);
		--motiongpu-font-sans: var(
			--font-sans,
			'Inter',
			'Segoe UI',
			'Helvetica Neue',
			Arial,
			sans-serif
		);
		--motiongpu-font-mono: var(--font-mono, 'SFMono-Regular', 'Menlo', 'Consolas', monospace);
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: clamp(0.75rem, 1.4vw, 1.5rem);
		background:
			radial-gradient(125% 125% at 50% 0%, rgba(255, 105, 0, 0.12) 0%, rgba(255, 105, 0, 0) 56%),
			rgba(12, 12, 14, 0.38);
		backdrop-filter: blur(10px);
		z-index: 2147483647;
		font-family: var(--motiongpu-font-sans);
	}

	.motiongpu-error-dialog {
		width: min(52rem, calc(100vw - 1.5rem));
		max-height: min(84vh, 44rem);
		overflow: auto;
		margin: 0;
		padding: 1.1rem;
		border: 1px solid var(--motiongpu-color-border);
		border-radius: var(--motiongpu-radius-xl);
		max-width: calc(100vw - 1.5rem);
		box-sizing: border-box;
		font-size: 0.875rem;
		font-weight: 300;
		line-height: 1.45;
		background: linear-gradient(
			180deg,
			var(--motiongpu-color-card) 0%,
			var(--motiongpu-color-background-muted) 100%
		);
		color: var(--motiongpu-color-foreground);
		box-shadow: var(--motiongpu-shadow-card);
	}

	.motiongpu-error-header {
		display: grid;
		gap: 0.55rem;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid var(--motiongpu-color-border);
	}

	.motiongpu-error-badge-wrap {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		width: fit-content;
		padding: 0.18rem;
		border-radius: 999px;
		border: 1px solid var(--motiongpu-color-border);
		background: var(--motiongpu-color-background-muted);
	}

	.motiongpu-error-phase {
		display: inline-flex;
		align-items: center;
		margin: 0;
		padding: 0.22rem 0.56rem;
		border-radius: 999px;
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		line-height: 1;
		font-weight: 500;
		text-transform: uppercase;
		color: var(--motiongpu-color-background);
		background: linear-gradient(
			180deg,
			var(--motiongpu-color-accent) 0%,
			var(--motiongpu-color-accent-secondary) 100%
		);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
	}

	.motiongpu-error-title {
		margin: 0;
		font-size: clamp(1.02rem, 1vw + 0.72rem, 1.32rem);
		font-weight: 500;
		line-height: 1.18;
		letter-spacing: -0.02em;
		text-wrap: balance;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-body {
		display: grid;
		gap: 0.62rem;
		margin-top: 0.92rem;
	}

	.motiongpu-error-message {
		margin: 0;
		padding: 0.72rem 0.78rem;
		border: 1px solid color-mix(in srgb, var(--motiongpu-color-accent) 28%, transparent);
		border-radius: var(--motiongpu-radius-md);
		background: color-mix(in srgb, var(--motiongpu-color-accent) 9%, var(--motiongpu-color-card));
		font-size: 0.82rem;
		line-height: 1.4;
		font-weight: 300;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-hint {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.45;
		font-weight: 300;
		color: var(--motiongpu-color-foreground-muted);
	}

	.motiongpu-error-sections {
		display: grid;
		gap: 0.62rem;
		margin-top: 0.95rem;
	}

	.motiongpu-error-source {
		display: grid;
		gap: 0.48rem;
		margin-top: 0.96rem;
	}

	.motiongpu-error-source-title {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 500;
		line-height: 1.3;
		letter-spacing: 0.045em;
		text-transform: uppercase;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-source-frame {
		border: 1px solid var(--motiongpu-color-border);
		border-radius: var(--motiongpu-radius-lg);
		overflow: hidden;
		background: var(--motiongpu-color-background-muted);
	}

	.motiongpu-error-source-tabs {
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid var(--motiongpu-color-border);
		background: var(--motiongpu-color-background);
	}

	.motiongpu-error-source-tab {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 0.68rem;
		font-size: 0.76rem;
		font-weight: 300;
		line-height: 1.2;
		color: var(--motiongpu-color-foreground-muted);
		border-right: 1px solid var(--motiongpu-color-border);
	}

	.motiongpu-error-source-tab-active {
		color: var(--motiongpu-color-foreground);
		background: var(--motiongpu-color-background-muted);
	}

	.motiongpu-error-source-tab-spacer {
		flex: 1 1 auto;
	}

	.motiongpu-error-source-snippet {
		display: grid;
		background: var(--motiongpu-color-background-muted);
	}

	.motiongpu-error-source-row {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		align-items: start;
		gap: 0.42rem;
		padding: 0.2rem 0.68rem;
	}

	.motiongpu-error-source-row-active {
		background: color-mix(in srgb, var(--motiongpu-color-accent) 10%, transparent);
	}

	.motiongpu-error-source-line {
		font-family: var(--motiongpu-font-mono);
		font-size: 0.77rem;
		font-weight: 300;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
		font-feature-settings: 'tnum' 1;
		border-right: 1px solid var(--motiongpu-color-border);
		color: var(--motiongpu-color-foreground-muted);
		text-align: left;
	}

	.motiongpu-error-source-code {
		font-family: var(--motiongpu-font-mono);
		font-size: 0.77rem;
		font-weight: 350;
		line-height: 1.3;
		color: var(--motiongpu-color-foreground);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.motiongpu-error-details {
		border: 1px solid var(--motiongpu-color-border);
		border-radius: var(--motiongpu-radius-lg);
		overflow: hidden;
		background: var(--motiongpu-color-background);
	}

	.motiongpu-error-details summary {
		cursor: pointer;
		padding: 0.56rem 0.68rem;
		font-size: 0.7rem;
		letter-spacing: 0.07em;
		line-height: 1.2;
		font-weight: 500;
		text-transform: uppercase;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-details[open] summary {
		border-bottom: 1px solid var(--motiongpu-color-border);
	}

	.motiongpu-error-details pre {
		margin: 0;
		padding: 0.62rem 0.68rem;
		white-space: pre-wrap;
		word-break: break-word;
		overflow: auto;
		background: var(--motiongpu-color-background-muted);
		font-size: 0.74rem;
		line-height: 1.4;
		font-weight: 300;
		color: var(--motiongpu-color-foreground);
		font-family: var(--motiongpu-font-mono);
	}

	@media (max-width: 42rem) {
		.motiongpu-error-overlay {
			padding: 0.62rem;
		}

		.motiongpu-error-dialog {
			padding: 0.85rem;
		}

		.motiongpu-error-title {
			font-size: 1.02rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.motiongpu-error-overlay {
			backdrop-filter: none;
		}
	}
</style>
