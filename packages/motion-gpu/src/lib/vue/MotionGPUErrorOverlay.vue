<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, useId } from 'vue';
import '../motion-gpu.css';
import { createMotionGPUErrorOverlayModel } from '../core/error-overlay-model.js';
import { registerErrorOverlay } from '../core/error-overlay-stack.js';
import type { MotionGPUErrorReport } from '../core/error-report.js';
import Portal from './Portal.vue';

interface Props {
	report: MotionGPUErrorReport;
	onDismiss: () => void;
}

const props = defineProps<Props>();

const ChevronDownIcon = () =>
	h(
		'svg',
		{
			class: 'motiongpu-error-details-chevron',
			viewBox: '0 0 18 18',
			fill: 'none',
			'aria-hidden': 'true',
			focusable: 'false'
		},
		[
			h('polyline', {
				points: '15.25 6.5 9 12.75 2.75 6.5',
				stroke: 'currentColor',
				'stroke-width': '1.5',
				'stroke-linecap': 'round',
				'stroke-linejoin': 'round'
			})
		]
	);

const componentId = useId();
const titleId = `${componentId}-title`;
const descriptionId = `${componentId}-description`;
const sourceTitleId = `${componentId}-source-title`;
const focusableSelector =
	'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const overlayElement = ref<HTMLDivElement | null>(null);
const dialogElement = ref<HTMLElement | null>(null);

function getFocusableElements(): HTMLElement[] {
	if (!dialogElement.value) return [];

	return Array.from(dialogElement.value.querySelectorAll<HTMLElement>(focusableSelector)).filter(
		(element) => element.getAttribute('aria-hidden') !== 'true'
	);
}

function handleDialogKeydown(event: KeyboardEvent): void {
	if (event.key !== 'Tab' || !dialogElement.value) return;

	const focusableElements = getFocusableElements();
	if (focusableElements.length === 0) {
		event.preventDefault();
		dialogElement.value.focus({ preventScroll: true });
		return;
	}

	const firstElement = focusableElements[0]!;
	const lastElement = focusableElements[focusableElements.length - 1]!;
	const activeElement = document.activeElement;
	const focusIsOutsideDialog =
		!(activeElement instanceof Node) || !dialogElement.value.contains(activeElement);

	if (
		event.shiftKey &&
		(activeElement === firstElement ||
			activeElement === dialogElement.value ||
			focusIsOutsideDialog)
	) {
		event.preventDefault();
		lastElement.focus();
		return;
	}

	if (
		!event.shiftKey &&
		(activeElement === lastElement || activeElement === dialogElement.value || focusIsOutsideDialog)
	) {
		event.preventDefault();
		firstElement.focus();
	}
}

let unregisterOverlay: (() => void) | undefined;

onMounted(() => {
	const portalRoot = overlayElement.value?.parentElement;
	if (!dialogElement.value || !portalRoot) return;

	unregisterOverlay = registerErrorOverlay({
		dialog: dialogElement.value,
		portalRoot,
		onDismiss: props.onDismiss
	});
});

onUnmounted(() => {
	unregisterOverlay?.();
});

const model = computed(() => createMotionGPUErrorOverlayModel(props.report));
const displayMessage = computed(() => model.value.displayMessage);
const showDisplayMessage = computed(() => displayMessage.value.length > 0);
const detailsText = computed(() => props.report.details.join('\n'));
const stackText = computed(() => props.report.stack.join('\n'));
const detailsSummary = computed(() =>
	props.report.source ? 'Additional diagnostics' : 'Technical details'
);
</script>

<template>
	<Portal>
		<div ref="overlayElement" class="motiongpu-error-overlay" role="presentation">
			<div class="motiongpu-error-dialog-shell" role="presentation">
				<div
					ref="dialogElement"
					class="motiongpu-error-dialog"
					role="alertdialog"
					aria-modal="true"
					:aria-labelledby="titleId"
					:aria-describedby="descriptionId"
					tabindex="-1"
					data-testid="motiongpu-error"
					@keydown="handleDialogKeydown"
				>
					<header class="motiongpu-error-header">
						<div class="motiongpu-error-header-top">
							<div class="motiongpu-error-header-copy">
								<h2 :id="titleId" class="motiongpu-error-title">{{ report.title }}</h2>
								<p class="motiongpu-error-recoverable">
									Recoverable: <span>{{ report.recoverable ? 'yes' : 'no' }}</span>
								</p>
							</div>
							<div class="motiongpu-error-badges">
								<div class="motiongpu-error-badge-wrap">
									<p class="motiongpu-error-badge motiongpu-error-badge-phase">
										{{ report.phase }}
									</p>
								</div>
								<div class="motiongpu-error-badge-wrap">
									<p class="motiongpu-error-badge motiongpu-error-badge-severity">
										{{ report.severity }}
									</p>
								</div>
							</div>
						</div>
					</header>
					<div :id="descriptionId" class="motiongpu-error-body">
						<p v-if="showDisplayMessage" class="motiongpu-error-message">{{ displayMessage }}</p>
						<p class="motiongpu-error-hint">{{ report.hint }}</p>
					</div>

					<section
						v-if="report.source"
						class="motiongpu-error-source"
						:aria-labelledby="sourceTitleId"
					>
						<h3 :id="sourceTitleId" class="motiongpu-error-source-title">Source</h3>
						<figure class="motiongpu-error-source-frame">
							<figcaption class="motiongpu-error-source-tabs">
								<span class="motiongpu-error-source-tab motiongpu-error-source-tab-active"
									>{{ report.source.location
									}}<template v-if="report.source.column"
										>, col {{ report.source.column }}</template
									></span
								>
								<span class="motiongpu-error-source-tab-spacer" aria-hidden="true"></span>
							</figcaption>

							<div
								class="motiongpu-error-source-snippet"
								role="region"
								:aria-label="`Source code from ${report.source.location}`"
							>
								<div
									v-for="snippetLine in report.source.snippet"
									:key="`snippet-${snippetLine.number}`"
									class="motiongpu-error-source-row"
									:class="{ 'motiongpu-error-source-row-active': snippetLine.highlight }"
								>
									<span class="motiongpu-error-source-line">
										<span v-if="snippetLine.highlight" class="motiongpu-sr-only">Error line: </span
										>{{ snippetLine.number }}
									</span>
									<span class="motiongpu-error-source-code">{{ snippetLine.code || ' ' }}</span>
								</div>
							</div>
						</figure>
					</section>

					<div class="motiongpu-error-sections">
						<details v-if="report.details.length > 0" class="motiongpu-error-details" open>
							<summary>
								<ChevronDownIcon /><span>{{ detailsSummary }}</span>
							</summary>
							<pre>{{ detailsText }}</pre>
						</details>
						<details v-if="report.stack.length > 0" class="motiongpu-error-details">
							<summary><ChevronDownIcon /><span>Stack trace</span></summary>
							<pre>{{ stackText }}</pre>
						</details>
						<details v-if="report.context" class="motiongpu-error-details">
							<summary><ChevronDownIcon /><span>Runtime context</span></summary>
							<pre>{{ model.runtimeContextText }}</pre>
						</details>
					</div>
				</div>
			</div>
		</div>
	</Portal>
</template>
