import { getContext, onDestroy, setContext } from 'svelte';
import { writable, type Readable } from 'svelte/store';
import type { FrameState, RenderMode } from './core/types';

export type FrameCallback = (state: FrameState) => void;
export type FrameKey = string | symbol;

export interface FrameTask {
	key: FrameKey;
	stage: FrameKey;
}

export interface FrameStage {
	key: FrameKey;
}

export interface UseFrameOptions {
	autoStart?: boolean;
	autoInvalidate?: boolean;
	stage?: FrameKey | FrameStage;
	before?: (FrameKey | FrameTask) | (FrameKey | FrameTask)[];
	after?: (FrameKey | FrameTask) | (FrameKey | FrameTask)[];
	running?: () => boolean;
}

export interface UseFrameResult {
	task: FrameTask;
	start: () => void;
	stop: () => void;
	started: Readable<boolean>;
}

export interface FrameScheduleSnapshot {
	stages: Array<{
		key: string;
		tasks: string[];
	}>;
}

export interface FrameRunTimings {
	total: number;
	stages: Record<
		string,
		{
			duration: number;
			tasks: Record<string, number>;
		}
	>;
}

interface RegisteredFrameTask extends UseFrameResult {
	unsubscribe: () => void;
}

interface InternalTask {
	task: FrameTask;
	callback: FrameCallback;
	order: number;
	started: boolean;
	lastRunning: boolean;
	startedStoreSet: (value: boolean) => void;
	startedStore: Readable<boolean>;
	before: Set<FrameKey>;
	after: Set<FrameKey>;
	autoInvalidate: boolean;
	running?: () => boolean;
}

interface InternalStage {
	key: FrameKey;
	order: number;
	started: boolean;
	before: Set<FrameKey>;
	after: Set<FrameKey>;
	tasks: Map<FrameKey, InternalTask>;
}

const FRAME_CONTEXT_KEY = Symbol('fragkit.frame-context');
const MAIN_STAGE_KEY = Symbol('fragkit-main-stage');

function asArray<T>(value: T | T[] | undefined): T[] {
	if (!value) {
		return [];
	}

	return Array.isArray(value) ? value : [value];
}

function toTaskKey(reference: FrameKey | FrameTask): FrameKey {
	if (typeof reference === 'string' || typeof reference === 'symbol') {
		return reference;
	}

	return reference.key;
}

function toStageKey(reference: FrameKey | FrameStage): FrameKey {
	if (typeof reference === 'string' || typeof reference === 'symbol') {
		return reference;
	}

	return reference.key;
}

function sortByDependencies<T extends { key: FrameKey; order: number }>(
	items: T[],
	getBefore: (item: T) => Iterable<FrameKey>,
	getAfter: (item: T) => Iterable<FrameKey>
): T[] {
	const itemsByKey = new Map<FrameKey, T>();
	for (const item of items) {
		itemsByKey.set(item.key, item);
	}

	const indegree = new Map<FrameKey, number>();
	const edges = new Map<FrameKey, Set<FrameKey>>();

	for (const item of items) {
		indegree.set(item.key, 0);
		edges.set(item.key, new Set());
	}

	for (const item of items) {
		for (const dependencyKey of getAfter(item)) {
			if (!itemsByKey.has(dependencyKey)) {
				continue;
			}

			edges.get(dependencyKey)?.add(item.key);
			indegree.set(item.key, (indegree.get(item.key) ?? 0) + 1);
		}

		for (const dependencyKey of getBefore(item)) {
			if (!itemsByKey.has(dependencyKey)) {
				continue;
			}

			edges.get(item.key)?.add(dependencyKey);
			indegree.set(dependencyKey, (indegree.get(dependencyKey) ?? 0) + 1);
		}
	}

	const queue = items.filter((item) => (indegree.get(item.key) ?? 0) === 0);
	queue.sort((a, b) => a.order - b.order);

	const ordered: T[] = [];
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			break;
		}

		ordered.push(current);

		for (const childKey of edges.get(current.key) ?? []) {
			const nextDegree = (indegree.get(childKey) ?? 0) - 1;
			indegree.set(childKey, nextDegree);
			if (nextDegree === 0) {
				const child = itemsByKey.get(childKey);
				if (child) {
					queue.push(child);
					queue.sort((a, b) => a.order - b.order);
				}
			}
		}
	}

	if (ordered.length !== items.length) {
		const missing = items.filter((item) => !ordered.some((entry) => entry.key === item.key));
		missing.sort((a, b) => a.order - b.order);
		ordered.push(...missing);
	}

	return ordered;
}

export interface FrameRegistry {
	register: (
		keyOrCallback: FrameKey | FrameCallback,
		callbackOrOptions?: FrameCallback | UseFrameOptions,
		maybeOptions?: UseFrameOptions
	) => RegisteredFrameTask;
	run: (state: FrameState) => void;
	invalidate: () => void;
	advance: () => void;
	shouldRender: () => boolean;
	endFrame: () => void;
	setRenderMode: (mode: RenderMode) => void;
	setAutoRender: (enabled: boolean) => void;
	setMaxDelta: (value: number) => void;
	setDiagnosticsEnabled: (enabled: boolean) => void;
	getRenderMode: () => RenderMode;
	getAutoRender: () => boolean;
	getMaxDelta: () => number;
	getDiagnosticsEnabled: () => boolean;
	getLastRunTimings: () => FrameRunTimings | null;
	getSchedule: () => FrameScheduleSnapshot;
	createStage: (
		key: FrameKey,
		options?: {
			before?: (FrameKey | FrameStage) | (FrameKey | FrameStage)[];
			after?: (FrameKey | FrameStage) | (FrameKey | FrameStage)[];
		}
	) => FrameStage;
	getStage: (key: FrameKey) => FrameStage | undefined;
	clear: () => void;
}

export function createFrameRegistry(options?: {
	renderMode?: RenderMode;
	autoRender?: boolean;
	maxDelta?: number;
	diagnosticsEnabled?: boolean;
}): FrameRegistry {
	let renderMode: RenderMode = options?.renderMode ?? 'always';
	let autoRender = options?.autoRender ?? true;
	let maxDelta = options?.maxDelta ?? 0.1;
	let diagnosticsEnabled = options?.diagnosticsEnabled ?? false;
	let lastRunTimings: FrameRunTimings | null = null;
	let frameInvalidated = true;
	let shouldAdvance = false;
	let orderCounter = 0;

	const assertMaxDelta = (value: number): number => {
		if (!Number.isFinite(value) || value <= 0) {
			throw new Error('maxDelta must be a finite number greater than 0');
		}
		return value;
	};

	maxDelta = assertMaxDelta(maxDelta);

	const stages = new Map<FrameKey, InternalStage>();

	const ensureStage = (
		stageReference: FrameKey | FrameStage,
		stageOptions?: { before?: (FrameKey | FrameStage)[]; after?: (FrameKey | FrameStage)[] }
	): InternalStage => {
		const stageKey = toStageKey(stageReference);
		const existing = stages.get(stageKey);
		if (existing) {
			return existing;
		}

		const stage: InternalStage = {
			key: stageKey,
			order: orderCounter++,
			started: true,
			before: new Set((stageOptions?.before ?? []).map((entry) => toStageKey(entry))),
			after: new Set((stageOptions?.after ?? []).map((entry) => toStageKey(entry))),
			tasks: new Map()
		};
		stages.set(stageKey, stage);
		return stage;
	};

	ensureStage(MAIN_STAGE_KEY);

	const resolveEffectiveRunning = (task: InternalTask): boolean => {
		const running = task.started && (task.running?.() ?? true);
		if (task.lastRunning !== running) {
			task.lastRunning = running;
			task.startedStoreSet(running);
		}
		return running;
	};

	const keyToString = (key: FrameKey): string => {
		return typeof key === 'symbol' ? key.toString() : key;
	};

	return {
		register(keyOrCallback, callbackOrOptions, maybeOptions) {
			const key =
				typeof keyOrCallback === 'function'
					? (Symbol('fragkit-task') as FrameKey)
					: (keyOrCallback as FrameKey);
			const callback =
				typeof keyOrCallback === 'function' ? keyOrCallback : (callbackOrOptions as FrameCallback);
			const taskOptions =
				typeof keyOrCallback === 'function'
					? ((callbackOrOptions as UseFrameOptions | undefined) ?? {})
					: (maybeOptions ?? {});

			if (typeof callback !== 'function') {
				throw new Error('useFrame requires a callback');
			}

			const before = asArray(taskOptions.before);
			const after = asArray(taskOptions.after);
			const inferredStage = [...before, ...after].find(
				(entry) => typeof entry === 'object' && entry !== null && 'stage' in entry
			) as FrameTask | undefined;
			const stageKey = taskOptions.stage
				? toStageKey(taskOptions.stage)
				: (inferredStage?.stage ?? MAIN_STAGE_KEY);

			const stage = ensureStage(stageKey);
			const startedWritable = writable(taskOptions.autoStart ?? true);

			const internalTask: InternalTask = {
				task: { key, stage: stage.key },
				callback,
				order: orderCounter++,
				started: taskOptions.autoStart ?? true,
				lastRunning: taskOptions.autoStart ?? true,
				startedStoreSet: startedWritable.set,
				startedStore: { subscribe: startedWritable.subscribe },
				before: new Set(before.map((entry) => toTaskKey(entry))),
				after: new Set(after.map((entry) => toTaskKey(entry))),
				autoInvalidate: taskOptions.autoInvalidate ?? true,
				running: taskOptions.running
			};

			stage.tasks.set(key, internalTask);
			internalTask.startedStoreSet(resolveEffectiveRunning(internalTask));

			const start = () => {
				internalTask.started = true;
				resolveEffectiveRunning(internalTask);
			};

			const stop = () => {
				internalTask.started = false;
				resolveEffectiveRunning(internalTask);
			};

			return {
				task: internalTask.task,
				start,
				stop,
				started: internalTask.startedStore,
				unsubscribe: () => {
					stage.tasks.delete(key);
				}
			};
		},
		run(state) {
			const clampedDelta = Math.min(state.delta, maxDelta);
			const frameState =
				clampedDelta === state.delta
					? state
					: {
							...state,
							delta: clampedDelta
						};

			const stageList = sortByDependencies(
				Array.from(stages.values()),
				(stage) => stage.before,
				(stage) => stage.after
			);
			const frameStart = diagnosticsEnabled ? performance.now() : 0;
			const stageTimings: FrameRunTimings['stages'] = {};

			for (const stage of stageList) {
				if (!stage.started) {
					continue;
				}
				const stageStart = diagnosticsEnabled ? performance.now() : 0;
				const taskTimings: Record<string, number> = {};

				const taskList = sortByDependencies(
					Array.from(stage.tasks.values()).map((task) => ({
						...task,
						key: task.task.key
					})),
					(task) => task.before,
					(task) => task.after
				);

				for (const task of taskList) {
					if (!resolveEffectiveRunning(task)) {
						continue;
					}
					const taskStart = diagnosticsEnabled ? performance.now() : 0;

					task.callback(frameState);
					if (diagnosticsEnabled) {
						taskTimings[keyToString(task.task.key)] = performance.now() - taskStart;
					}
					if (task.autoInvalidate) {
						frameInvalidated = true;
					}
				}

				if (diagnosticsEnabled) {
					stageTimings[keyToString(stage.key)] = {
						duration: performance.now() - stageStart,
						tasks: taskTimings
					};
				}
			}

			if (diagnosticsEnabled) {
				lastRunTimings = {
					total: performance.now() - frameStart,
					stages: stageTimings
				};
			}
		},
		invalidate() {
			frameInvalidated = true;
		},
		advance() {
			shouldAdvance = true;
			frameInvalidated = true;
		},
		shouldRender() {
			if (!autoRender) {
				return false;
			}

			if (renderMode === 'always') {
				return true;
			}

			if (renderMode === 'on-demand') {
				return frameInvalidated;
			}

			return shouldAdvance;
		},
		endFrame() {
			frameInvalidated = false;
			shouldAdvance = false;
		},
		setRenderMode(mode) {
			renderMode = mode;
		},
		setAutoRender(enabled) {
			autoRender = enabled;
		},
		setMaxDelta(value) {
			maxDelta = assertMaxDelta(value);
		},
		setDiagnosticsEnabled(enabled) {
			diagnosticsEnabled = enabled;
			if (!enabled) {
				lastRunTimings = null;
			}
		},
		getRenderMode() {
			return renderMode;
		},
		getAutoRender() {
			return autoRender;
		},
		getMaxDelta() {
			return maxDelta;
		},
		getDiagnosticsEnabled() {
			return diagnosticsEnabled;
		},
		getLastRunTimings() {
			return lastRunTimings;
		},
		getSchedule() {
			const stageList = sortByDependencies(
				Array.from(stages.values()),
				(stage) => stage.before,
				(stage) => stage.after
			);

			return {
				stages: stageList.map((stage) => {
					const taskList = sortByDependencies(
						Array.from(stage.tasks.values()).map((task) => ({
							...task,
							key: task.task.key
						})),
						(task) => task.before,
						(task) => task.after
					);

					return {
						key: keyToString(stage.key),
						tasks: taskList.map((task) => keyToString(task.task.key))
					};
				})
			};
		},
		createStage(key, options) {
			const stage = ensureStage(key, {
				before: asArray(options?.before),
				after: asArray(options?.after)
			});
			return { key: stage.key };
		},
		getStage(key) {
			const stage = stages.get(key);
			if (!stage) {
				return undefined;
			}
			return { key: stage.key };
		},
		clear() {
			for (const stage of stages.values()) {
				stage.tasks.clear();
			}
		}
	};
}

export function provideFrameRegistry(registry: FrameRegistry): void {
	setContext(FRAME_CONTEXT_KEY, registry);
}

export function useFrame(callback: FrameCallback, options?: UseFrameOptions): UseFrameResult;
export function useFrame(
	key: FrameKey,
	callback: FrameCallback,
	options?: UseFrameOptions
): UseFrameResult;
export function useFrame(
	keyOrCallback: FrameKey | FrameCallback,
	callbackOrOptions?: FrameCallback | UseFrameOptions,
	maybeOptions?: UseFrameOptions
): UseFrameResult {
	const registry = getContext<FrameRegistry>(FRAME_CONTEXT_KEY);
	if (!registry) {
		throw new Error('useFrame must be used inside <FragCanvas>');
	}

	const registration =
		typeof keyOrCallback === 'function'
			? registry.register(keyOrCallback, callbackOrOptions as UseFrameOptions | undefined)
			: registry.register(keyOrCallback, callbackOrOptions as FrameCallback, maybeOptions);
	onDestroy(registration.unsubscribe);

	return {
		task: registration.task,
		start: registration.start,
		stop: registration.stop,
		started: registration.started
	};
}
