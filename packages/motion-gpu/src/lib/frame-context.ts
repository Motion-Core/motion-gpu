import { getContext, onDestroy, setContext } from 'svelte';
import { writable, type Readable } from 'svelte/store';
import type { FrameInvalidationToken, FrameState, RenderMode } from './core/types';

/**
 * Per-frame callback executed by the frame scheduler.
 */
export type FrameCallback = (state: FrameState) => void;

/**
 * Stable key type used to identify frame tasks and stages.
 */
export type FrameKey = string | symbol;

/**
 * Public metadata describing a registered frame task.
 */
export interface FrameTask {
	key: FrameKey;
	stage: FrameKey;
}

/**
 * Public metadata describing a frame stage.
 */
export interface FrameStage {
	key: FrameKey;
}

/**
 * Stage callback allowing custom orchestration around task execution.
 */
export type FrameStageCallback = (state: FrameState, runTasks: () => void) => void;

/**
 * Options controlling task registration and scheduling behavior.
 */
export interface UseFrameOptions {
	/**
	 * Whether task starts in active state.
	 *
	 * @default true
	 */
	autoStart?: boolean;
	/**
	 * Whether task execution invalidates frame automatically.
	 *
	 * @default true
	 */
	autoInvalidate?: boolean;
	/**
	 * Explicit task invalidation policy.
	 */
	invalidation?: FrameTaskInvalidation;
	/**
	 * Stage to register task in.
	 *
	 * If omitted, main stage is used unless inferred from task dependencies.
	 */
	stage?: FrameKey | FrameStage;
	/**
	 * Task dependencies that should run after this task.
	 */
	before?: (FrameKey | FrameTask) | (FrameKey | FrameTask)[];
	/**
	 * Task dependencies that should run before this task.
	 */
	after?: (FrameKey | FrameTask) | (FrameKey | FrameTask)[];
	/**
	 * Dynamic predicate controlling whether the task is currently active.
	 */
	running?: () => boolean;
}

/**
 * Invalidation token value or resolver.
 */
export type FrameTaskInvalidationToken =
	| FrameInvalidationToken
	| (() => FrameInvalidationToken | null | undefined);

/**
 * Explicit task invalidation policy.
 */
export type FrameTaskInvalidation =
	| 'never'
	| 'always'
	| {
			mode?: 'never' | 'always';
			token?: FrameTaskInvalidationToken;
	  }
	| {
			mode: 'on-change';
			token: FrameTaskInvalidationToken;
	  };

/**
 * Handle returned by `useFrame` registration.
 */
export interface UseFrameResult {
	/**
	 * Registered task metadata.
	 */
	task: FrameTask;
	/**
	 * Starts task execution.
	 */
	start: () => void;
	/**
	 * Stops task execution.
	 */
	stop: () => void;
	/**
	 * Readable flag representing effective running state.
	 */
	started: Readable<boolean>;
}

/**
 * Snapshot of the resolved stage/task execution order.
 */
export interface FrameScheduleSnapshot {
	stages: Array<{
		key: string;
		tasks: string[];
	}>;
}

/**
 * Optional scheduler diagnostics payload captured for the last run.
 */
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

/**
 * Aggregated timing statistics for stage/task profiling.
 */
export interface FrameTimingStats {
	last: number;
	avg: number;
	min: number;
	max: number;
	count: number;
}

/**
 * Profiling snapshot aggregated from the configured history window.
 */
export interface FrameProfilingSnapshot {
	window: number;
	frameCount: number;
	lastFrame: FrameRunTimings | null;
	total: FrameTimingStats;
	stages: Record<
		string,
		{
			timings: FrameTimingStats;
			tasks: Record<string, FrameTimingStats>;
		}
	>;
}

/**
 * Internal registration payload including unsubscribe callback.
 */
interface RegisteredFrameTask extends UseFrameResult {
	unsubscribe: () => void;
}

/**
 * Internal mutable task descriptor used by scheduler runtime.
 */
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
	invalidation: {
		mode: 'never' | 'always' | 'on-change';
		token?: FrameTaskInvalidationToken;
		lastToken: FrameInvalidationToken | null;
		hasToken: boolean;
	};
	running?: () => boolean;
}

/**
 * Internal mutable stage descriptor used by scheduler runtime.
 */
interface InternalStage {
	key: FrameKey;
	order: number;
	started: boolean;
	before: Set<FrameKey>;
	after: Set<FrameKey>;
	callback: FrameStageCallback;
	tasks: Map<FrameKey, InternalTask>;
}

/**
 * Svelte context key for the active frame registry.
 */
const FRAME_CONTEXT_KEY = Symbol('motiongpu.frame-context');

/**
 * Default stage key used when task stage is not explicitly specified.
 */
const MAIN_STAGE_KEY = Symbol('motiongpu-main-stage');
const RENDER_MODE_INVALIDATION_TOKEN = Symbol('motiongpu-render-mode-change');

/**
 * Default stage callback that runs tasks immediately.
 */
const DEFAULT_STAGE_CALLBACK: FrameStageCallback = (_state, runTasks) => runTasks();

/**
 * Normalizes scalar-or-array options to array form.
 */
function asArray<T>(value: T | T[] | undefined): T[] {
	if (!value) {
		return [];
	}

	return Array.isArray(value) ? value : [value];
}

/**
 * Extracts task key from either direct key or task reference.
 */
function toTaskKey(reference: FrameKey | FrameTask): FrameKey {
	if (typeof reference === 'string' || typeof reference === 'symbol') {
		return reference;
	}

	return reference.key;
}

/**
 * Extracts stage key from either direct key or stage reference.
 */
function toStageKey(reference: FrameKey | FrameStage): FrameKey {
	if (typeof reference === 'string' || typeof reference === 'symbol') {
		return reference;
	}

	return reference.key;
}

/**
 * Resolves invalidation token from static value or resolver callback.
 */
function resolveInvalidationToken(
	token: FrameTaskInvalidationToken | undefined
): FrameInvalidationToken | null {
	if (token === undefined) {
		return null;
	}

	const resolved = typeof token === 'function' ? token() : token;
	if (resolved === null || resolved === undefined) {
		return null;
	}

	return resolved;
}

/**
 * Normalizes task invalidation options to runtime representation.
 */
function normalizeTaskInvalidation(
	key: FrameKey,
	options: UseFrameOptions
): InternalTask['invalidation'] {
	const explicit = options.invalidation;
	if (explicit === undefined) {
		if (options.autoInvalidate === false) {
			return {
				mode: 'never',
				lastToken: null,
				hasToken: false
			};
		}

		return {
			mode: 'always',
			token: key,
			lastToken: null,
			hasToken: false
		};
	}

	if (explicit === 'never' || explicit === 'always') {
		if (explicit === 'never') {
			return {
				mode: explicit,
				lastToken: null,
				hasToken: false
			};
		}

		return {
			mode: explicit,
			token: key,
			lastToken: null,
			hasToken: false
		};
	}

	const mode = explicit.mode ?? 'always';
	const token = explicit.token;
	if (mode === 'on-change' && token === undefined) {
		throw new Error('Task invalidation mode "on-change" requires a token');
	}

	if (mode === 'never') {
		return {
			mode,
			lastToken: null,
			hasToken: false
		};
	}

	if (mode === 'on-change') {
		return {
			mode,
			token: token as FrameTaskInvalidationToken,
			lastToken: null,
			hasToken: false
		};
	}

	return {
		mode,
		token: token ?? key,
		lastToken: null,
		hasToken: false
	};
}

/**
 * Computes aggregate timing stats from sampled durations.
 */
function buildTimingStats(samples: number[], last: number): FrameTimingStats {
	if (samples.length === 0) {
		return {
			last,
			avg: 0,
			min: 0,
			max: 0,
			count: 0
		};
	}

	let sum = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;

	for (const value of samples) {
		sum += value;
		if (value < min) {
			min = value;
		}
		if (value > max) {
			max = value;
		}
	}

	return {
		last,
		avg: sum / samples.length,
		min,
		max,
		count: samples.length
	};
}

/**
 * Topologically sorts items by `before`/`after` dependencies with stable order fallback.
 */
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

/**
 * Runtime registry that stores frame tasks/stages and drives render scheduling.
 */
export interface FrameRegistry {
	/**
	 * Registers a frame callback in the scheduler.
	 */
	register: (
		keyOrCallback: FrameKey | FrameCallback,
		callbackOrOptions?: FrameCallback | UseFrameOptions,
		maybeOptions?: UseFrameOptions
	) => RegisteredFrameTask;
	/**
	 * Executes one scheduler run.
	 */
	run: (state: FrameState) => void;
	/**
	 * Marks frame as invalidated for `on-demand` mode.
	 */
	invalidate: (token?: FrameInvalidationToken) => void;
	/**
	 * Requests a single render in `manual` mode.
	 */
	advance: () => void;
	/**
	 * Returns whether renderer should submit a frame now.
	 */
	shouldRender: () => boolean;
	/**
	 * Resets one-frame invalidation/advance flags.
	 */
	endFrame: () => void;
	/**
	 * Sets render scheduling mode.
	 */
	setRenderMode: (mode: RenderMode) => void;
	/**
	 * Enables or disables automatic rendering entirely.
	 */
	setAutoRender: (enabled: boolean) => void;
	/**
	 * Sets maximum allowed delta passed to frame tasks.
	 */
	setMaxDelta: (value: number) => void;
	/**
	 * Enables/disables frame profiling.
	 */
	setProfilingEnabled: (enabled: boolean) => void;
	/**
	 * Sets profiling history window (in frames).
	 */
	setProfilingWindow: (window: number) => void;
	/**
	 * Clears collected profiling samples.
	 */
	resetProfiling: () => void;
	/**
	 * Enables/disables diagnostics capture.
	 */
	setDiagnosticsEnabled: (enabled: boolean) => void;
	/**
	 * Returns current render mode.
	 */
	getRenderMode: () => RenderMode;
	/**
	 * Returns whether automatic rendering is enabled.
	 */
	getAutoRender: () => boolean;
	/**
	 * Returns current max delta clamp.
	 */
	getMaxDelta: () => number;
	/**
	 * Returns profiling toggle state.
	 */
	getProfilingEnabled: () => boolean;
	/**
	 * Returns active profiling history window (in frames).
	 */
	getProfilingWindow: () => number;
	/**
	 * Returns aggregated profiling snapshot.
	 */
	getProfilingSnapshot: () => FrameProfilingSnapshot | null;
	/**
	 * Returns diagnostics toggle state.
	 */
	getDiagnosticsEnabled: () => boolean;
	/**
	 * Returns last run timings snapshot when diagnostics are enabled.
	 */
	getLastRunTimings: () => FrameRunTimings | null;
	/**
	 * Returns dependency-sorted schedule snapshot.
	 */
	getSchedule: () => FrameScheduleSnapshot;
	/**
	 * Creates or updates a stage.
	 */
	createStage: (
		key: FrameKey,
		options?: {
			before?: (FrameKey | FrameStage) | (FrameKey | FrameStage)[];
			after?: (FrameKey | FrameStage) | (FrameKey | FrameStage)[];
			callback?: FrameStageCallback | null;
		}
	) => FrameStage;
	/**
	 * Reads stage metadata by key.
	 */
	getStage: (key: FrameKey) => FrameStage | undefined;
	/**
	 * Removes all tasks from all stages.
	 */
	clear: () => void;
}

/**
 * Creates a frame registry used by `FragCanvas` and `useFrame`.
 *
 * @param options - Initial scheduler options.
 * @returns Mutable frame registry instance.
 */
export function createFrameRegistry(options?: {
	renderMode?: RenderMode;
	autoRender?: boolean;
	maxDelta?: number;
	profilingEnabled?: boolean;
	profilingWindow?: number;
	diagnosticsEnabled?: boolean;
}): FrameRegistry {
	let renderMode: RenderMode = options?.renderMode ?? 'always';
	let autoRender = options?.autoRender ?? true;
	let maxDelta = options?.maxDelta ?? 0.1;
	let profilingEnabled = options?.profilingEnabled ?? options?.diagnosticsEnabled ?? false;
	let profilingWindow = options?.profilingWindow ?? 120;
	let lastRunTimings: FrameRunTimings | null = null;
	const profilingHistory: FrameRunTimings[] = [];
	let hasUntokenizedInvalidation = true;
	const invalidationTokens = new Set<FrameInvalidationToken>();
	let shouldAdvance = false;
	let orderCounter = 0;

	const assertMaxDelta = (value: number): number => {
		if (!Number.isFinite(value) || value <= 0) {
			throw new Error('maxDelta must be a finite number greater than 0');
		}
		return value;
	};

	const assertProfilingWindow = (value: number): number => {
		if (!Number.isFinite(value) || value <= 0) {
			throw new Error('profilingWindow must be a finite number greater than 0');
		}
		return Math.floor(value);
	};

	maxDelta = assertMaxDelta(maxDelta);
	profilingWindow = assertProfilingWindow(profilingWindow);

	const stages = new Map<FrameKey, InternalStage>();
	let scheduleDirty = true;
	let sortedStages: InternalStage[] = [];
	const sortedTasksByStage = new Map<FrameKey, InternalTask[]>();
	let scheduleSnapshot: FrameScheduleSnapshot = { stages: [] };

	const markScheduleDirty = (): void => {
		scheduleDirty = true;
	};

	const syncSchedule = (): void => {
		if (!scheduleDirty) {
			return;
		}

		const stageList = sortByDependencies(
			Array.from(stages.values()),
			(stage) => stage.before,
			(stage) => stage.after
		);
		const nextTasksByStage = new Map<FrameKey, InternalTask[]>();

		for (const stage of stageList) {
			const taskList = sortByDependencies(
				Array.from(stage.tasks.values()).map((task) => ({
					key: task.task.key,
					order: task.order,
					task
				})),
				(task) => task.task.before,
				(task) => task.task.after
			).map((task) => task.task);
			nextTasksByStage.set(stage.key, taskList);
		}

		sortedStages = stageList;
		sortedTasksByStage.clear();
		for (const [stageKey, taskList] of nextTasksByStage) {
			sortedTasksByStage.set(stageKey, taskList);
		}

		scheduleSnapshot = {
			stages: sortedStages.map((stage) => ({
				key: keyToString(stage.key),
				tasks: (sortedTasksByStage.get(stage.key) ?? []).map((task) => keyToString(task.task.key))
			}))
		};

		scheduleDirty = false;
	};

	const pushProfile = (timings: FrameRunTimings): void => {
		profilingHistory.push(timings);
		while (profilingHistory.length > profilingWindow) {
			profilingHistory.shift();
		}
	};

	const clearProfiling = (): void => {
		profilingHistory.length = 0;
		lastRunTimings = null;
	};

	const buildProfilingSnapshot = (): FrameProfilingSnapshot | null => {
		if (!profilingEnabled) {
			return null;
		}

		const stageBuckets = new Map<
			string,
			{
				durations: number[];
				taskDurations: Map<string, number[]>;
			}
		>();
		const totalDurations: number[] = [];

		for (const frame of profilingHistory) {
			totalDurations.push(frame.total);
			for (const [stageKey, stageTiming] of Object.entries(frame.stages)) {
				const stageBucket = stageBuckets.get(stageKey) ?? {
					durations: [],
					taskDurations: new Map<string, number[]>()
				};
				stageBucket.durations.push(stageTiming.duration);

				for (const [taskKey, taskDuration] of Object.entries(stageTiming.tasks)) {
					const bucket = stageBucket.taskDurations.get(taskKey) ?? [];
					bucket.push(taskDuration);
					stageBucket.taskDurations.set(taskKey, bucket);
				}

				stageBuckets.set(stageKey, stageBucket);
			}
		}

		const stagesSnapshot: FrameProfilingSnapshot['stages'] = {};
		for (const [stageKey, stageBucket] of stageBuckets) {
			const lastStageDuration = lastRunTimings?.stages[stageKey]?.duration ?? 0;
			const taskSnapshot: Record<string, FrameTimingStats> = {};
			for (const [taskKey, taskDurations] of stageBucket.taskDurations) {
				const lastTaskDuration = lastRunTimings?.stages[stageKey]?.tasks[taskKey] ?? 0;
				taskSnapshot[taskKey] = buildTimingStats(taskDurations, lastTaskDuration);
			}

			stagesSnapshot[stageKey] = {
				timings: buildTimingStats(stageBucket.durations, lastStageDuration),
				tasks: taskSnapshot
			};
		}

		return {
			window: profilingWindow,
			frameCount: profilingHistory.length,
			lastFrame: lastRunTimings,
			total: buildTimingStats(totalDurations, lastRunTimings?.total ?? 0),
			stages: stagesSnapshot
		};
	};

	const ensureStage = (
		stageReference: FrameKey | FrameStage,
		stageOptions?: {
			before?: (FrameKey | FrameStage)[];
			after?: (FrameKey | FrameStage)[];
			callback?: FrameStageCallback | null;
		}
	): InternalStage => {
		const stageKey = toStageKey(stageReference);
		const existing = stages.get(stageKey);
		if (existing) {
			if (stageOptions?.before !== undefined) {
				existing.before = new Set(stageOptions.before.map((entry) => toStageKey(entry)));
				markScheduleDirty();
			}
			if (stageOptions?.after !== undefined) {
				existing.after = new Set(stageOptions.after.map((entry) => toStageKey(entry)));
				markScheduleDirty();
			}
			if (stageOptions && Object.prototype.hasOwnProperty.call(stageOptions, 'callback')) {
				existing.callback = stageOptions.callback ?? DEFAULT_STAGE_CALLBACK;
			}
			return existing;
		}

		const stage: InternalStage = {
			key: stageKey,
			order: orderCounter++,
			started: true,
			before: new Set((stageOptions?.before ?? []).map((entry) => toStageKey(entry))),
			after: new Set((stageOptions?.after ?? []).map((entry) => toStageKey(entry))),
			callback: stageOptions?.callback ?? DEFAULT_STAGE_CALLBACK,
			tasks: new Map()
		};
		stages.set(stageKey, stage);
		markScheduleDirty();
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

	const hasPendingInvalidation = (): boolean => {
		return hasUntokenizedInvalidation || invalidationTokens.size > 0;
	};

	const invalidateWithToken = (token?: FrameInvalidationToken): void => {
		if (token === undefined) {
			hasUntokenizedInvalidation = true;
			return;
		}

		invalidationTokens.add(token);
	};

	const applyTaskInvalidation = (task: InternalTask): void => {
		const config = task.invalidation;
		if (config.mode === 'never') {
			return;
		}

		if (config.mode === 'always') {
			const token = resolveInvalidationToken(config.token);
			invalidateWithToken(token ?? task.task.key);
			return;
		}

		const token = resolveInvalidationToken(config.token);
		if (token === null) {
			config.hasToken = false;
			config.lastToken = null;
			return;
		}

		const changed = !config.hasToken || config.lastToken !== token;
		config.hasToken = true;
		config.lastToken = token;
		if (changed) {
			invalidateWithToken(token);
		}
	};

	return {
		register(keyOrCallback, callbackOrOptions, maybeOptions) {
			const key =
				typeof keyOrCallback === 'function'
					? (Symbol('motiongpu-task') as FrameKey)
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
				invalidation: normalizeTaskInvalidation(key, taskOptions)
			};

			if (taskOptions.running) {
				internalTask.running = taskOptions.running;
			}

			stage.tasks.set(key, internalTask);
			markScheduleDirty();
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
					if (stage.tasks.delete(key)) {
						markScheduleDirty();
					}
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
			syncSchedule();
			const frameStart = profilingEnabled ? performance.now() : 0;
			const stageTimings: FrameRunTimings['stages'] = {};

			for (const stage of sortedStages) {
				if (!stage.started) {
					continue;
				}
				const stageStart = profilingEnabled ? performance.now() : 0;
				const taskTimings: Record<string, number> = {};
				const taskList = sortedTasksByStage.get(stage.key) ?? [];

				stage.callback(frameState, () => {
					for (const task of taskList) {
						if (!resolveEffectiveRunning(task)) {
							continue;
						}
						const taskStart = profilingEnabled ? performance.now() : 0;

						task.callback(frameState);
						if (profilingEnabled) {
							taskTimings[keyToString(task.task.key)] = performance.now() - taskStart;
						}
						applyTaskInvalidation(task);
					}
				});

				if (profilingEnabled) {
					stageTimings[keyToString(stage.key)] = {
						duration: performance.now() - stageStart,
						tasks: taskTimings
					};
				}
			}

			if (profilingEnabled) {
				const timings = {
					total: performance.now() - frameStart,
					stages: stageTimings
				};
				lastRunTimings = timings;
				pushProfile(timings);
			}
		},
		invalidate(token) {
			invalidateWithToken(token);
		},
		advance() {
			shouldAdvance = true;
			invalidateWithToken();
		},
		shouldRender() {
			if (!autoRender) {
				return false;
			}

			if (renderMode === 'always') {
				return true;
			}

			if (renderMode === 'on-demand') {
				return shouldAdvance || hasPendingInvalidation();
			}

			return shouldAdvance;
		},
		endFrame() {
			hasUntokenizedInvalidation = false;
			invalidationTokens.clear();
			shouldAdvance = false;
		},
		setRenderMode(mode) {
			if (renderMode === mode) {
				return;
			}

			renderMode = mode;
			shouldAdvance = false;
			if (mode === 'on-demand') {
				invalidateWithToken(RENDER_MODE_INVALIDATION_TOKEN);
			}
		},
		setAutoRender(enabled) {
			autoRender = enabled;
		},
		setMaxDelta(value) {
			maxDelta = assertMaxDelta(value);
		},
		setProfilingEnabled(enabled) {
			profilingEnabled = enabled;
			if (!enabled) {
				clearProfiling();
			}
		},
		setProfilingWindow(window) {
			profilingWindow = assertProfilingWindow(window);
			while (profilingHistory.length > profilingWindow) {
				profilingHistory.shift();
			}
		},
		resetProfiling() {
			clearProfiling();
		},
		setDiagnosticsEnabled(enabled) {
			profilingEnabled = enabled;
			if (!enabled) {
				clearProfiling();
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
		getProfilingEnabled() {
			return profilingEnabled;
		},
		getProfilingWindow() {
			return profilingWindow;
		},
		getProfilingSnapshot() {
			return buildProfilingSnapshot();
		},
		getDiagnosticsEnabled() {
			return profilingEnabled;
		},
		getLastRunTimings() {
			return lastRunTimings;
		},
		getSchedule() {
			syncSchedule();
			return scheduleSnapshot;
		},
		createStage(key, options) {
			const stageOptions: Parameters<typeof ensureStage>[1] | undefined = options
				? {
						...(Object.prototype.hasOwnProperty.call(options, 'before')
							? { before: asArray(options.before) }
							: {}),
						...(Object.prototype.hasOwnProperty.call(options, 'after')
							? { after: asArray(options.after) }
							: {}),
						...(Object.prototype.hasOwnProperty.call(options, 'callback')
							? { callback: options.callback ?? null }
							: {})
					}
				: undefined;
			const stage = ensureStage(key, stageOptions);
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
			markScheduleDirty();
		}
	};
}

/**
 * Provides a frame registry through Svelte context.
 *
 * @param registry - Registry to provide.
 */
export function provideFrameRegistry(registry: FrameRegistry): void {
	setContext(FRAME_CONTEXT_KEY, registry);
}

/**
 * Registers a frame callback using an auto-generated task key.
 */
export function useFrame(callback: FrameCallback, options?: UseFrameOptions): UseFrameResult;

/**
 * Registers a frame callback with an explicit task key.
 */
export function useFrame(
	key: FrameKey,
	callback: FrameCallback,
	options?: UseFrameOptions
): UseFrameResult;

/**
 * Registers a callback in the active frame registry and auto-unsubscribes on destroy.
 *
 * @returns Frame task handle for start/stop control.
 * @throws {Error} When used outside `<FragCanvas>`.
 */
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
