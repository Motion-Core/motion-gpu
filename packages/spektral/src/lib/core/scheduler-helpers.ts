import type {
	FrameProfilingSnapshot,
	FrameRegistry,
	FrameRunTimings,
	FrameScheduleSnapshot
} from './frame-registry.js';

/**
 * Public scheduler control surface shared by framework adapters.
 */
export type SpektralScheduler = Pick<
	FrameRegistry,
	| 'createStage'
	| 'getStage'
	| 'setDiagnosticsEnabled'
	| 'getDiagnosticsEnabled'
	| 'getLastRunTimings'
	| 'getSchedule'
	| 'setProfilingEnabled'
	| 'setProfilingWindow'
	| 'resetProfiling'
	| 'getProfilingEnabled'
	| 'getProfilingWindow'
	| 'getProfilingSnapshot'
>;

/**
 * Named scheduler presets exposed from advanced entrypoints.
 */
export type SchedulerPreset = 'balanced' | 'debug' | 'performance';

/**
 * Resolved scheduler timing configuration.
 *
 * Note: diagnostics and profiling currently share one internal toggle in the frame registry.
 */
export interface SchedulerPresetConfig {
	diagnosticsEnabled: boolean;
	profilingEnabled: boolean;
	profilingWindow: number;
}

/**
 * Optional overrides applied on top of a named scheduler preset.
 */
export interface ApplySchedulerPresetOptions {
	diagnosticsEnabled?: boolean;
	profilingEnabled?: boolean;
	profilingWindow?: number;
}

/**
 * Snapshot payload useful for scheduler diagnostics UIs and debug tooling.
 */
export interface SchedulerDebugSnapshot {
	diagnosticsEnabled: boolean;
	profilingEnabled: boolean;
	profilingWindow: number;
	schedule: FrameScheduleSnapshot;
	lastRunTimings: FrameRunTimings | null;
	profilingSnapshot: FrameProfilingSnapshot | null;
}

const PRESET_CONFIG: Record<SchedulerPreset, SchedulerPresetConfig> = {
	performance: {
		diagnosticsEnabled: false,
		profilingEnabled: false,
		profilingWindow: 60
	},
	balanced: {
		diagnosticsEnabled: true,
		profilingEnabled: true,
		profilingWindow: 120
	},
	debug: {
		diagnosticsEnabled: true,
		profilingEnabled: true,
		profilingWindow: 240
	}
};

const MAX_PROFILING_WINDOW = 10_000;

function assertProfilingWindow(value: number): number {
	if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PROFILING_WINDOW) {
		throw new Error(`profilingWindow must be a safe integer between 1 and ${MAX_PROFILING_WINDOW}`);
	}

	return value;
}

/**
 * Applies a named scheduler preset to the runtime scheduler instance.
 *
 * Returns resolved values after overrides for easy logging/telemetry.
 */
export function applySchedulerPreset(
	scheduler: SpektralScheduler,
	preset: SchedulerPreset,
	options: ApplySchedulerPresetOptions = {}
): SchedulerPresetConfig {
	const base = PRESET_CONFIG[preset];
	const diagnosticsEnabled = options.diagnosticsEnabled ?? base.diagnosticsEnabled;
	const profilingEnabled = options.profilingEnabled ?? base.profilingEnabled;
	if (diagnosticsEnabled !== profilingEnabled) {
		throw new Error(
			'Spektral scheduler currently shares diagnostics/profiling state; both values must match'
		);
	}

	const profilingWindow = assertProfilingWindow(options.profilingWindow ?? base.profilingWindow);

	scheduler.setProfilingWindow(profilingWindow);
	scheduler.setDiagnosticsEnabled(diagnosticsEnabled);
	scheduler.setProfilingEnabled(profilingEnabled);

	return {
		diagnosticsEnabled,
		profilingEnabled,
		profilingWindow
	};
}

/**
 * Captures an aggregate scheduler diagnostics snapshot.
 */
export function captureSchedulerDebugSnapshot(
	scheduler: SpektralScheduler
): SchedulerDebugSnapshot {
	return {
		diagnosticsEnabled: scheduler.getDiagnosticsEnabled(),
		profilingEnabled: scheduler.getProfilingEnabled(),
		profilingWindow: scheduler.getProfilingWindow(),
		schedule: scheduler.getSchedule(),
		lastRunTimings: scheduler.getLastRunTimings(),
		profilingSnapshot: scheduler.getProfilingSnapshot()
	};
}
