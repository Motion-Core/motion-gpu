import { describe, expect, it, vi } from 'vitest';
import type { CurrentReadable } from '../../lib/core/current-value.js';
import { createCurrentWritable } from '../../lib/core/current-value.js';
import { createFrameRegistry } from '../../lib/core/frame-registry.js';
import { createSpektralGraphBridge } from '../../lib/core/render-graph-reader.js';
import {
	createSpektralUserContextStore,
	type SpektralContext,
	type SpektralUserNamespace,
	type SetSpektralUserContextOptions
} from '../../lib/core/spektral-context.js';

type UserContextStore = Record<SpektralUserNamespace, unknown>;

export interface UserContextSetter {
	<UCT = unknown>(
		namespace: SpektralUserNamespace,
		value: UCT | (() => UCT),
		options?: SetSpektralUserContextOptions
	): UCT | undefined;
}

export interface UserContextSafetyResult {
	toStringValue: unknown;
	constructorValue: unknown;
	protoValue: unknown;
	hasSpecialNamespaces: boolean;
	symbolValues: unknown[];
	dateMerge: unknown;
	classMerge: unknown;
	nonPlainNextPreserved: boolean;
	nullPrototypeMerge: unknown;
	allSnapshotsFrozen: boolean;
	allSnapshotsHaveNullPrototype: boolean;
	mutationThrew: boolean;
	mutationLeaked: boolean;
}

export interface UserContextSemanticsResult {
	initial: Record<string, unknown>;
	skipped: Record<string, unknown>;
	merged: Record<string, unknown>;
	replaced: Record<string, unknown>;
	skippedAfterReplace: Record<string, unknown>;
	pluginStore: CurrentReadable<Record<string, unknown> | undefined>;
	allStore: CurrentReadable<UserContextStore>;
	contextRefs: {
		beforeInitial: UserContextStore;
		afterInitial: UserContextStore;
		afterSkipped: UserContextStore;
		afterMerged: UserContextStore;
		afterReplaced: UserContextStore;
		afterSkippedAfterReplace: UserContextStore;
	};
	safety: UserContextSafetyResult;
}

export interface UserContextSubscriptionResult {
	allEvents: UserContextStore[];
	pluginEvents: unknown[];
	beforeUnsubscribeCounts: { all: number; plugin: number };
	mergedFallback: Record<string, unknown>;
	currentPlugin: Record<string, unknown>;
}

export interface UserContextFunctionValueResult {
	sameReference: boolean;
	callsAfterSet: number;
	invokedValue: string | null;
	callsAfterInvoke: number;
}

interface UserContextStabilityResult {
	sameAllStore: boolean;
	samePluginStore: boolean;
}

export interface UserContextContractDriver {
	framework: 'react' | 'svelte' | 'vue';
	readOutside: () => void;
	writeOutside?: {
		name: string;
		mount: () => { invoke: () => void; current: () => unknown };
	};
	runSemantics: () => Promise<UserContextSemanticsResult>;
	runSubscriptions: () => Promise<UserContextSubscriptionResult>;
	runFunctionValue: () => Promise<UserContextFunctionValueResult>;
	runTypedNamespace: () => Promise<{ enabled: boolean }>;
	runStability?: () => Promise<UserContextStabilityResult[]>;
}

export function createUserContextRuntimeHarness(): { context: SpektralContext } {
	const registry = createFrameRegistry();
	const graphBridge = createSpektralGraphBridge();
	return {
		context: {
			canvas: undefined,
			size: createCurrentWritable({ width: 0, height: 0 }),
			dpr: createCurrentWritable(1),
			maxDelta: createCurrentWritable(0.1),
			renderMode: createCurrentWritable<'always' | 'manual' | 'on-demand'>('always'),
			autoRender: createCurrentWritable(true),
			user: createSpektralUserContextStore(),
			graph: graphBridge.graph,
			invalidate: registry.invalidate,
			advance: registry.advance,
			scheduler: {
				createStage: registry.createStage,
				getStage: registry.getStage,
				setDiagnosticsEnabled: registry.setDiagnosticsEnabled,
				getDiagnosticsEnabled: registry.getDiagnosticsEnabled,
				getLastRunTimings: registry.getLastRunTimings,
				getSchedule: registry.getSchedule,
				setProfilingEnabled: registry.setProfilingEnabled,
				setProfilingWindow: registry.setProfilingWindow,
				resetProfiling: registry.resetProfiling,
				getProfilingEnabled: registry.getProfilingEnabled,
				getProfilingWindow: registry.getProfilingWindow,
				getProfilingSnapshot: registry.getProfilingSnapshot
			}
		}
	};
}

export function runUserContextSemantics(
	allStore: CurrentReadable<UserContextStore>,
	pluginStore: CurrentReadable<Record<string, unknown> | undefined>,
	setUserContext: UserContextSetter
): UserContextSemanticsResult {
	const beforeInitial = allStore.current;
	const initial = setUserContext('plugin', () => ({ mode: 'initial', enabled: true }));
	const afterInitial = allStore.current;
	const skipped = setUserContext('plugin', () => ({ mode: 'skipped' }));
	const afterSkipped = allStore.current;
	const merged = setUserContext('plugin', () => ({ merged: true }), { existing: 'merge' });
	const afterMerged = allStore.current;
	const replaced = setUserContext('plugin', () => ({ mode: 'replaced' }), {
		existing: 'replace'
	});
	const afterReplaced = allStore.current;
	const skippedAfterReplace = setUserContext('plugin', () => ({ mode: 'unchanged' }));
	const afterSkippedAfterReplace = allStore.current;
	const safety = runUserContextSafety(allStore, setUserContext);

	return {
		initial: initial as Record<string, unknown>,
		skipped: skipped as Record<string, unknown>,
		merged: merged as Record<string, unknown>,
		replaced: replaced as Record<string, unknown>,
		skippedAfterReplace: skippedAfterReplace as Record<string, unknown>,
		pluginStore,
		allStore,
		contextRefs: {
			beforeInitial,
			afterInitial,
			afterSkipped,
			afterMerged,
			afterReplaced,
			afterSkippedAfterReplace
		},
		safety
	};
}

function runUserContextSafety(
	allStore: CurrentReadable<UserContextStore>,
	setUserContext: UserContextSetter
): UserContextSafetyResult {
	const snapshots: UserContextStore[] = [];
	const unsubscribe = allStore.subscribe((snapshot) => snapshots.push(snapshot));

	const toStringValue = setUserContext('toString', 'own-to-string');
	const constructorValue = setUserContext('constructor', 'own-constructor');
	const protoValue = setUserContext('__proto__', 'own-proto');
	const firstSymbol = Symbol('shared');
	const secondSymbol = Symbol('shared');
	setUserContext(firstSymbol, 'first-symbol');
	setUserContext(secondSymbol, 'second-symbol');

	const dateValue = Object.assign(new Date(0), { leaked: true });
	setUserContext('date-value', dateValue, { existing: 'replace' });
	const dateMerge = setUserContext('date-value', { replaced: true }, { existing: 'merge' });
	class ClassValue {
		legacy = true;
	}
	setUserContext('class-value', new ClassValue(), { existing: 'replace' });
	const classMerge = setUserContext('class-value', { replaced: true }, { existing: 'merge' });

	setUserContext('plain-value', { initial: true }, { existing: 'replace' });
	const nonPlainNext = Object.assign(new Date(1), { replacement: true });
	const nonPlainNextResult = setUserContext('plain-value', nonPlainNext, { existing: 'merge' });

	const nullPrototypeValue = Object.assign(Object.create(null) as Record<string, unknown>, {
		initial: true
	});
	setUserContext('null-prototype-value', nullPrototypeValue, { existing: 'replace' });
	const nullPrototypeMerge = setUserContext(
		'null-prototype-value',
		{ merged: true },
		{ existing: 'merge' }
	);

	const callbackSnapshot = snapshots.at(-1) as UserContextStore;
	let mutationThrew = false;
	try {
		(callbackSnapshot as Record<SpektralUserNamespace, unknown>).corruption = true;
	} catch {
		mutationThrew = true;
	}
	const mutationLeaked = Object.hasOwn(allStore.current, 'corruption');
	unsubscribe();

	return {
		toStringValue,
		constructorValue,
		protoValue,
		hasSpecialNamespaces:
			Object.hasOwn(allStore.current, 'toString') &&
			Object.hasOwn(allStore.current, 'constructor') &&
			Object.hasOwn(allStore.current, '__proto__'),
		symbolValues: [allStore.current[firstSymbol], allStore.current[secondSymbol]],
		dateMerge,
		classMerge,
		nonPlainNextPreserved:
			nonPlainNextResult === nonPlainNext && allStore.current['plain-value'] === nonPlainNext,
		nullPrototypeMerge,
		allSnapshotsFrozen: snapshots.every(Object.isFrozen),
		allSnapshotsHaveNullPrototype: snapshots.every(
			(snapshot) => Object.getPrototypeOf(snapshot) === null
		),
		mutationThrew,
		mutationLeaked
	};
}

export function runUserContextSubscriptions(
	allStore: CurrentReadable<UserContextStore>,
	pluginStore: CurrentReadable<unknown>,
	setUserContext: UserContextSetter
): UserContextSubscriptionResult {
	const allEvents: UserContextStore[] = [];
	const pluginEvents: unknown[] = [];
	const unsubscribeAll = allStore.subscribe((value) => allEvents.push(value));
	const unsubscribePlugin = pluginStore.subscribe((value) => pluginEvents.push(value));

	setUserContext('plugin', () => ({ mode: 'first' }), { existing: 'replace' });
	setUserContext('plugin', () => ({ enabled: true }), { existing: 'merge' });
	setUserContext<unknown>('plugin', () => 7, { existing: 'replace' });
	const mergedFallback = setUserContext('plugin', () => ({ mode: 'fallback' }), {
		existing: 'merge'
	});
	const beforeUnsubscribeCounts = { all: allEvents.length, plugin: pluginEvents.length };

	unsubscribeAll();
	unsubscribePlugin();
	setUserContext('plugin', () => ({ mode: 'after-unsubscribe' }), { existing: 'replace' });

	return {
		allEvents,
		pluginEvents,
		beforeUnsubscribeCounts,
		mergedFallback: mergedFallback as Record<string, unknown>,
		currentPlugin: pluginStore.current as Record<string, unknown>
	};
}

export function runUserContextFunctionValue(
	framework: string,
	pluginStore: CurrentReadable<(() => string) | undefined>,
	setUserContext: UserContextSetter
): UserContextFunctionValueResult {
	const storedFunction = vi.fn(() => `${framework}-function`);
	const result = setUserContext<() => string>('plugin', storedFunction, {
		existing: 'replace',
		functionValue: 'value'
	});
	const current = pluginStore.current;
	const callsAfterSet = storedFunction.mock.calls.length;
	const invokedValue = current?.() ?? null;

	return {
		sameReference: result === storedFunction && current === storedFunction,
		callsAfterSet,
		invokedValue,
		callsAfterInvoke: storedFunction.mock.calls.length
	};
}

export function runUserContextTypedNamespace(
	pluginStore: CurrentReadable<{ enabled: boolean } | undefined>,
	setUserContext: UserContextSetter
): { enabled: boolean } {
	setUserContext('plugin', () => ({ enabled: true }), { existing: 'replace' });
	return { enabled: pluginStore.current?.enabled ?? false };
}

/** Registers the complete adapter-neutral user-context behavior contract. */
export function defineUserContextContract(driver: UserContextContractDriver): void {
	describe(`${driver.framework} useSpektralUserContext`, () => {
		it('throws when used outside <FragCanvas>', () => {
			expect(driver.readOutside).toThrow(/useSpektral must be used inside <FragCanvas>/);
		});

		if (driver.writeOutside) {
			it(driver.writeOutside.name, () => {
				const write = driver.writeOutside?.mount();
				if (!write) throw new Error('Expected write-outside driver');
				expect(write.invoke).toThrow();
				expect(write.current()).toBeUndefined();
			});
		}

		it('supports scoped set/get with skip, merge and replace modes', async () => {
			const result = await driver.runSemantics();
			expect(result.initial).toEqual({ mode: 'initial', enabled: true });
			expect(result.skipped).toEqual({ mode: 'initial', enabled: true });
			expect(result.merged).toEqual({ mode: 'initial', enabled: true, merged: true });
			expect(result.replaced).toEqual({ mode: 'replaced' });
			expect(result.skippedAfterReplace).toEqual({ mode: 'replaced' });
			expect(result.pluginStore.current).toEqual({ mode: 'replaced' });
			expect(result.allStore.current.plugin).toEqual({ mode: 'replaced' });
			expect(result.contextRefs.afterInitial).not.toBe(result.contextRefs.beforeInitial);
			expect(result.contextRefs.afterMerged).not.toBe(result.contextRefs.afterSkipped);
			expect(result.contextRefs.afterReplaced).not.toBe(result.contextRefs.afterMerged);
			expect(result.contextRefs.afterSkippedAfterReplace).toBe(result.contextRefs.afterReplaced);
		});

		it('isolates special and symbol namespaces in readonly null-prototype snapshots', async () => {
			const { safety } = await driver.runSemantics();
			expect(safety).toEqual({
				toStringValue: 'own-to-string',
				constructorValue: 'own-constructor',
				protoValue: 'own-proto',
				hasSpecialNamespaces: true,
				symbolValues: ['first-symbol', 'second-symbol'],
				dateMerge: { replaced: true },
				classMerge: { replaced: true },
				nonPlainNextPreserved: true,
				nullPrototypeMerge: { initial: true, merged: true },
				allSnapshotsFrozen: true,
				allSnapshotsHaveNullPrototype: true,
				mutationThrew: true,
				mutationLeaked: false
			});
		});

		it('emits updates via all-store and scoped-store subscriptions and stops after unsubscribe', async () => {
			const result = await driver.runSubscriptions();
			expect(result.beforeUnsubscribeCounts).toEqual({ all: 5, plugin: 5 });
			expect(result.allEvents).toHaveLength(5);
			expect(result.pluginEvents).toEqual([
				undefined,
				{ mode: 'first' },
				{ mode: 'first', enabled: true },
				7,
				{ mode: 'fallback' }
			]);
			expect(result.currentPlugin).toEqual({ mode: 'after-unsubscribe' });
		});

		it('falls back to replace semantics when merge mode receives a non-object existing value', async () => {
			const result = await driver.runSubscriptions();
			expect(result.mergedFallback).toEqual({ mode: 'fallback' });
		});

		if (driver.runStability) {
			it('returns stable store references across rerenders for the same namespace', async () => {
				const results = await driver.runStability?.();
				expect(results).toHaveLength(2);
				for (const result of results ?? []) {
					expect(result).toMatchObject({ sameAllStore: true, samePluginStore: true });
				}
			});
		}

		it('stores function values when functionValue mode is set to value', async () => {
			const result = await driver.runFunctionValue();
			expect(result.sameReference).toBe(true);
			expect(result.callsAfterSet).toBe(0);
			expect(result.invokedValue).toBe(`${driver.framework}-function`);
			expect(result.callsAfterInvoke).toBe(1);
		});

		it('infers scoped namespace value type from typed context map', async () => {
			expect(await driver.runTypedNamespace()).toEqual({ enabled: true });
		});
	});
}
