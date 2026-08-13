export interface ConfidenceInterval {
	lower: number;
	upper: number;
	confidence: number;
}

export interface RobustStats {
	samples: number[];
	median: number;
	mad: number;
	coefficientOfVariationPct: number;
	p5: number;
	p95: number;
	min: number;
	max: number;
	bootstrapMedianCi: ConfidenceInterval;
}

function assertSamples(samples: readonly number[]): void {
	if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample))) {
		throw new Error('Statistics require at least one finite sample');
	}
}

export function quantile(sortedSamples: readonly number[], probability: number): number {
	assertSamples(sortedSamples);
	if (probability < 0 || probability > 1) {
		throw new Error(`Quantile probability must be within [0, 1], received ${probability}`);
	}
	const position = (sortedSamples.length - 1) * probability;
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	const lower = sortedSamples[lowerIndex] ?? 0;
	const upper = sortedSamples[upperIndex] ?? lower;
	return lower + (upper - lower) * (position - lowerIndex);
}

export function median(samples: readonly number[]): number {
	assertSamples(samples);
	return quantile(
		[...samples].sort((a, b) => a - b),
		0.5
	);
}

function createRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		return state / 0x1_0000_0000;
	};
}

export function bootstrapMedianConfidenceInterval(
	samples: readonly number[],
	options: { confidence?: number; iterations?: number; seed?: number } = {}
): ConfidenceInterval {
	assertSamples(samples);
	const confidence = options.confidence ?? 0.95;
	const iterations = options.iterations ?? 2_000;
	if (confidence <= 0 || confidence >= 1) {
		throw new Error(`Confidence must be within (0, 1), received ${confidence}`);
	}
	if (!Number.isInteger(iterations) || iterations < 100) {
		throw new Error(`Bootstrap iterations must be an integer >= 100, received ${iterations}`);
	}

	const random = createRandom(options.seed ?? 0x4d475055);
	const medians = Array.from({ length: iterations }, () => {
		const resample = Array.from(
			{ length: samples.length },
			() => samples[Math.floor(random() * samples.length)] ?? 0
		);
		return median(resample);
	}).sort((a, b) => a - b);
	const tail = (1 - confidence) / 2;
	return {
		lower: quantile(medians, tail),
		upper: quantile(medians, 1 - tail),
		confidence
	};
}

export function computeRobustStats(samples: readonly number[]): RobustStats {
	assertSamples(samples);
	const sorted = [...samples].sort((a, b) => a - b);
	const center = quantile(sorted, 0.5);
	const absoluteDeviations = sorted.map((sample) => Math.abs(sample - center));
	const mean = sorted.reduce((sum, sample) => sum + sample, 0) / sorted.length;
	const variance = sorted.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) / sorted.length;
	return {
		samples: [...samples],
		median: center,
		mad: median(absoluteDeviations),
		coefficientOfVariationPct: mean === 0 ? 0 : (Math.sqrt(variance) / Math.abs(mean)) * 100,
		p5: quantile(sorted, 0.05),
		p95: quantile(sorted, 0.95),
		min: sorted[0] ?? 0,
		max: sorted[sorted.length - 1] ?? 0,
		bootstrapMedianCi: bootstrapMedianConfidenceInterval(samples)
	};
}
