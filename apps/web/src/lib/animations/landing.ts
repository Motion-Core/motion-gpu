import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

const SECTION_SELECTOR = '[data-reveal-section]';
const BADGE_SELECTOR = '[data-reveal="badge"]';
const CARD_SELECTOR = '[data-reveal="card"]';
const ACTIONS_SELECTOR = '[data-reveal="actions"]';
const ACTION_ITEM_SELECTOR = ':scope > *';
const TEXT_SELECTOR = 'h1, h2, h3, p, a, [data-reveal="text"]';

export const LANDING_ANIMATION_CONFIG = Object.freeze({
	easeName: 'landing-reveal-ease',
	easeCurve: '0.625, 0.05, 0, 1',
	y: 15,
	duration: 0.8,
	textWordStagger: 0.025,
	textBlur: 10,
	textElementStagger: 0.08,
	cardStagger: 0.12,
	scrollStart: 'top 78%',
	toggleActions: 'play none none reverse' as const
});

let pluginsRegistered = false;

function registerPlugins() {
	if (pluginsRegistered) return;
	gsap.registerPlugin(ScrollTrigger, CustomEase, SplitText);
	CustomEase.create(LANDING_ANIMATION_CONFIG.easeName, LANDING_ANIMATION_CONFIG.easeCurve);
	pluginsRegistered = true;
}

function uniqueElements(elements: HTMLElement[]) {
	return Array.from(new Set(elements));
}

function queryElements(section: HTMLElement, selector: string) {
	return Array.from(section.querySelectorAll<HTMLElement>(selector));
}

function isRenderableElement(element: HTMLElement) {
	const styles = window.getComputedStyle(element);
	if (styles.display === 'none' || styles.visibility === 'hidden') return false;
	return element.getClientRects().length > 0;
}

function isInsideCard(element: HTMLElement) {
	return Boolean(element.closest(CARD_SELECTOR));
}

function collectTargets(section: HTMLElement) {
	const badges = uniqueElements(queryElements(section, BADGE_SELECTOR));
	const cards = uniqueElements(queryElements(section, CARD_SELECTOR).filter(isRenderableElement));
	const actionGroups = uniqueElements(
		queryElements(section, ACTIONS_SELECTOR).filter((element) => !isInsideCard(element))
	);
	const actionItems = uniqueElements(
		actionGroups.flatMap((group) => queryElements(group, ACTION_ITEM_SELECTOR))
	);
	const texts = uniqueElements(
		queryElements(section, TEXT_SELECTOR).filter(
			(element) =>
				!isInsideCard(element) &&
				!element.matches(BADGE_SELECTOR) &&
				!element.closest(BADGE_SELECTOR) &&
				!element.matches(ACTIONS_SELECTOR) &&
				!element.closest(ACTIONS_SELECTOR)
		)
	);

	const fallback = queryElements(section, ':scope > div').slice(0, 1);

	return {
		badges,
		texts,
		actions: actionItems.length > 0 ? actionItems : actionGroups,
		cards,
		fallback
	};
}

export function createLandingScrollAnimations(root: HTMLElement) {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;

	registerPlugins();

	const config = LANDING_ANIMATION_CONFIG;
	const splitTextInstances: SplitText[] = [];
	const focusListenerCleanups: (() => void)[] = [];

	const context = gsap.context(() => {
		const sections = gsap.utils.toArray<HTMLElement>(SECTION_SELECTOR, root);

		for (const section of sections) {
			const { badges, texts, actions, cards, fallback } = collectTargets(section);
			const hasTargets =
				badges.length > 0 || texts.length > 0 || actions.length > 0 || cards.length > 0;

			const timeline = gsap.timeline({
				defaults: {
					ease: config.easeName,
					duration: config.duration
				},
				scrollTrigger: {
					trigger: section,
					start: config.scrollStart,
					toggleActions: config.toggleActions
				}
			});

			if (badges.length > 0) {
				timeline.from(badges, { opacity: 0, y: config.y });
			}

			if (texts.length > 0) {
				const words = texts.flatMap((element) => {
					const splitText = SplitText.create(element, {
						type: 'words',
						wordsClass: 'split-word'
					});
					splitTextInstances.push(splitText);
					return splitText.words as HTMLElement[];
				});

				if (words.length > 0) {
					gsap.set(words, { willChange: 'transform, filter, opacity' });
					timeline.fromTo(
						words,
						{
							opacity: 0,
							y: config.y,
							filter: `blur(${config.textBlur.toString()}px)`
						},
						{
							opacity: 1,
							y: 0,
							filter: 'blur(0px)',
							stagger: config.textWordStagger,
							clearProps: 'willChange'
						},
						badges.length > 0 ? '-=0.45' : 0
					);
				}
			}

			if (actions.length > 0) {
				timeline.from(
					actions,
					{
						opacity: 0,
						y: config.y,
						stagger: config.textElementStagger
					},
					'-=0.45'
				);
			}

			if (cards.length > 0) {
				timeline.from(
					cards,
					{
						opacity: 0,
						y: config.y,
						stagger: config.cardStagger
					},
					'-=0.35'
				);
			}

			if (!hasTargets && fallback.length > 0) {
				timeline.from(fallback, { opacity: 0, y: config.y });
			}

			const revealOnFocus = () => {
				if (timeline.progress() < 1) timeline.play();
			};
			section.addEventListener('focusin', revealOnFocus);
			focusListenerCleanups.push(() => {
				section.removeEventListener('focusin', revealOnFocus);
			});
		}

		ScrollTrigger.refresh();
	}, root);

	return () => {
		for (const cleanup of focusListenerCleanups) cleanup();
		for (const splitText of splitTextInstances.reverse()) {
			splitText.revert();
		}
		context.revert();
	};
}
