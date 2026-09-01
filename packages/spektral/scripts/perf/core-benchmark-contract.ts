export const DEFAULT_CORE_BENCHMARK_SEED = 0x53_50_45_4b;

export interface CoreBenchmarkConfig {
	processCount: number;
	sampleCount: number;
	warmupMs: number;
	seed: number;
	caseOrder: 'seeded-per-process';
}

const COMPATIBILITY_FIELDS = [
	'processCount',
	'sampleCount',
	'warmupMs',
	'seed',
	'caseOrder'
] as const;

export function compareCoreBenchmarkConfigs(
	current: CoreBenchmarkConfig,
	baseline: CoreBenchmarkConfig
): string[] {
	return COMPATIBILITY_FIELDS.filter((field) => current[field] !== baseline[field]).map(
		(field) =>
			`config.${field}: current=${String(current[field])} baseline=${String(baseline[field])}`
	);
}
