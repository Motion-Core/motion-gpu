import { describe, expect, it } from 'vitest';
import type {
	ResolvedComputeAccess,
	ResolvedComputePassResources,
	ResolvedTextureSubresourceRange
} from '../../lib/core/compute-resources';
import {
	analyzeComputeDependencies,
	ComputeDependencyAnalysisError
} from '../../lib/core/render-graph-dependencies';

function access(input: Partial<ResolvedComputeAccess> & { alias: string }): ResolvedComputeAccess {
	return {
		alias: input.alias,
		resourceKind: input.resourceKind ?? 'texture',
		logicalId: input.logicalId ?? input.alias,
		physicalId: input.physicalId ?? input.logicalId ?? input.alias,
		mode: input.mode ?? 'read',
		version: input.version ?? 'current',
		...(input.subresource ? { subresource: input.subresource } : {})
	};
}

function resources(input: {
	reads?: ResolvedComputeAccess[];
	writes?: ResolvedComputeAccess[];
}): ResolvedComputePassResources {
	return {
		entries: [],
		reads: input.reads ?? [],
		writes: input.writes ?? [],
		topologyKey: 'test',
		bindingCount: 0
	};
}

function node(value: string, resolved: ResolvedComputePassResources) {
	return { value, label: value, resources: resolved };
}

function range(baseMipLevel: number, baseArrayLayer = 0): ResolvedTextureSubresourceRange {
	return { baseMipLevel, mipLevelCount: 1, baseArrayLayer, arrayLayerCount: 1 };
}

describe('compute render-graph dependency analysis', () => {
	it('preserves every reason when one directed edge has multiple physical hazards', () => {
		const velocity = {};
		const density = {};
		const analysis = analyzeComputeDependencies([
			node(
				'writer',
				resources({
					writes: [
						access({ alias: 'velocityOut', physicalId: velocity, mode: 'write' }),
						access({ alias: 'densityOut', physicalId: density, mode: 'write' })
					]
				})
			),
			node(
				'reader',
				resources({
					reads: [
						access({ alias: 'velocityIn', physicalId: velocity }),
						access({ alias: 'densityIn', physicalId: density })
					]
				})
			)
		]);

		expect(analysis.orderedNodes).toEqual(['writer', 'reader']);
		expect(analysis.edges).toHaveLength(1);
		expect(analysis.edges[0]?.reasons.map((reason) => reason.reader.alias)).toEqual([
			'velocityIn',
			'densityIn'
		]);
		expect(analysis.edges[0]?.reasons.every((reason) => reason.hazard === 'RAW')).toBe(true);
	});

	it('creates RAW after-writer and WAR before-writer order from read versions', () => {
		const currentPhysical = {};
		const initialPhysical = {};
		const analysis = analyzeComputeDependencies([
			node(
				'current-reader',
				resources({ reads: [access({ alias: 'currentIn', physicalId: currentPhysical })] })
			),
			node(
				'writer',
				resources({
					writes: [
						access({ alias: 'currentOut', physicalId: currentPhysical, mode: 'write' }),
						access({ alias: 'initialOut', physicalId: initialPhysical, mode: 'write' })
					]
				})
			),
			node(
				'initial-reader',
				resources({
					reads: [access({ alias: 'initialIn', physicalId: initialPhysical, version: 'initial' })]
				})
			)
		]);

		expect(analysis.orderedNodes).toEqual(['initial-reader', 'writer', 'current-reader']);
		expect(analysis.edges.map((edge) => [edge.from, edge.to, edge.reasons[0]?.hazard])).toEqual([
			['writer', 'current-reader', 'RAW'],
			['initial-reader', 'writer', 'WAR']
		]);
	});

	it('exposes structural multiple-writer diagnostics for aliases of one physical resource', () => {
		const physicalId = {};
		try {
			analyzeComputeDependencies([
				node(
					'first',
					resources({
						writes: [
							access({
								alias: 'firstAlias',
								logicalId: 'logical-a',
								physicalId,
								mode: 'write',
								subresource: range(2, 1)
							})
						]
					})
				),
				node(
					'second',
					resources({
						writes: [
							access({
								alias: 'secondAlias',
								logicalId: 'logical-b',
								physicalId,
								mode: 'write',
								subresource: range(2, 1)
							})
						]
					})
				)
			]);
			expect.fail('Expected multiple writers to be rejected.');
		} catch (error) {
			expect(error).toBeInstanceOf(ComputeDependencyAnalysisError);
			const diagnostic = (error as ComputeDependencyAnalysisError<string>).diagnostic;
			expect(diagnostic).toMatchObject({
				kind: 'multiple-writers',
				firstNode: 'first',
				secondNode: 'second',
				firstAccess: { alias: 'firstAlias', logicalId: 'logical-a', physicalId },
				secondAccess: { alias: 'secondAlias', logicalId: 'logical-b', physicalId },
				reason: {
					hazard: 'WAW',
					resourceKind: 'texture',
					physicalId,
					firstWriter: { alias: 'firstAlias' },
					secondWriter: { alias: 'secondAlias' },
					textureOverlap: {
						baseMipLevel: 2,
						mipLevelCount: 1,
						baseArrayLayer: 1,
						arrayLayerCount: 1
					}
				}
			});
		}
	});

	it('reports a structural cycle with the complete edge reasons', () => {
		const a = {};
		const b = {};
		try {
			analyzeComputeDependencies([
				node(
					'A',
					resources({
						reads: [access({ alias: 'bIn', physicalId: b })],
						writes: [access({ alias: 'aOut', physicalId: a, mode: 'write' })]
					})
				),
				node(
					'B',
					resources({
						reads: [access({ alias: 'aIn', physicalId: a })],
						writes: [access({ alias: 'bOut', physicalId: b, mode: 'write' })]
					})
				)
			]);
			expect.fail('Expected a cycle to be rejected.');
		} catch (error) {
			const diagnostic = (error as ComputeDependencyAnalysisError<string>).diagnostic;
			expect(diagnostic.kind).toBe('cycle');
			if (diagnostic.kind === 'cycle') {
				expect(diagnostic.blockedNodes).toEqual(['A', 'B']);
				expect(
					diagnostic.edges.flatMap((edge) => edge.reasons.map((reason) => reason.reader.alias))
				).toEqual(['bIn', 'aIn']);
			}
		}
	});

	it('excludes downstream nodes and edges from cycle diagnostics', () => {
		const a = {};
		const b = {};
		const c = {};
		try {
			analyzeComputeDependencies([
				node(
					'A',
					resources({
						reads: [access({ alias: 'bIn', physicalId: b })],
						writes: [access({ alias: 'aOut', physicalId: a, mode: 'write' })]
					})
				),
				node(
					'B',
					resources({
						reads: [access({ alias: 'aIn', physicalId: a })],
						writes: [access({ alias: 'bOut', physicalId: b, mode: 'write' })]
					})
				),
				node('C', resources({ reads: [access({ alias: 'cIn', physicalId: b })] })),
				node('independent', resources({ writes: [access({ alias: 'cOut', physicalId: c })] }))
			]);
			expect.fail('Expected a cycle to be rejected.');
		} catch (error) {
			const diagnostic = (error as ComputeDependencyAnalysisError<string>).diagnostic;
			expect(diagnostic.kind).toBe('cycle');
			if (diagnostic.kind === 'cycle') {
				expect(diagnostic.blockedNodes).toEqual(['A', 'B']);
				expect(diagnostic.blockedLabels).toEqual(['A', 'B']);
				expect(diagnostic.edges.map((edge) => [edge.from, edge.to])).toEqual([
					['B', 'A'],
					['A', 'B']
				]);
			}
		}
	});

	it('adds dependencies only for overlapping texture mip and layer ranges', () => {
		const physicalId = {};
		const writer = node(
			'writer',
			resources({
				writes: [access({ alias: 'out', physicalId, mode: 'write', subresource: range(1, 2) })]
			})
		);
		const overlapping = node(
			'overlap',
			resources({ reads: [access({ alias: 'overlapIn', physicalId, subresource: range(1, 2) })] })
		);
		const disjointMip = node(
			'disjoint-mip',
			resources({ reads: [access({ alias: 'mipIn', physicalId, subresource: range(2, 2) })] })
		);
		const disjointLayer = node(
			'disjoint-layer',
			resources({ reads: [access({ alias: 'layerIn', physicalId, subresource: range(1, 3) })] })
		);
		const analysis = analyzeComputeDependencies([overlapping, disjointMip, disjointLayer, writer]);

		expect(analysis.edges).toHaveLength(1);
		expect(analysis.edges[0]).toMatchObject({
			from: 'writer',
			to: 'overlap',
			reasons: [
				{
					textureOverlap: {
						baseMipLevel: 1,
						mipLevelCount: 1,
						baseArrayLayer: 2,
						arrayLayerCount: 1
					}
				}
			]
		});
	});
});
