export interface BenchmarkMetricRule {
	readonly direction: 'higher' | 'lower';
	readonly maxRegressionPct: number;
}

export interface BenchmarkComparisonRow<TMetric extends string, TRule extends BenchmarkMetricRule> {
	metric: TMetric;
	current: number;
	baseline: number | null;
	deltaPct: number | null;
	regression: boolean;
	rule: TRule;
}

/** Compares benchmark metrics against directional percentage thresholds. */
export function compareBenchmarkMetrics<TMetric extends string, TRule extends BenchmarkMetricRule>(
	current: Readonly<Record<TMetric, number>>,
	baseline: Readonly<Partial<Record<TMetric, number>>>,
	rules: Readonly<Record<TMetric, TRule>>
): {
	rows: Array<BenchmarkComparisonRow<TMetric, TRule>>;
	regressions: Array<BenchmarkComparisonRow<TMetric, TRule>>;
} {
	const rows: Array<BenchmarkComparisonRow<TMetric, TRule>> = [];

	for (const metric of Object.keys(rules) as TMetric[]) {
		const rule = rules[metric];
		const currentValue = current[metric];
		const baselineValue = baseline[metric];
		if (baselineValue === undefined) {
			rows.push({
				metric,
				current: currentValue,
				baseline: null,
				deltaPct: null,
				regression: false,
				rule
			});
			continue;
		}

		const deltaPct =
			baselineValue === 0
				? currentValue === 0
					? 0
					: currentValue > 0
						? Number.POSITIVE_INFINITY
						: Number.NEGATIVE_INFINITY
				: ((currentValue - baselineValue) / baselineValue) * 100;
		const regression =
			rule.direction === 'higher'
				? deltaPct < -rule.maxRegressionPct
				: deltaPct > rule.maxRegressionPct;

		rows.push({
			metric,
			current: currentValue,
			baseline: baselineValue,
			deltaPct,
			regression,
			rule
		});
	}

	return { rows, regressions: rows.filter((row) => row.regression) };
}
