import { ComputeScenario } from './scenarios/ComputeScenario';
import { PassesScenario } from './scenarios/PassesScenario';
import { PerfScenario } from './scenarios/PerfScenario';
import { RuntimeScenario } from './scenarios/RuntimeScenario';
import { ShaderRecoveryScenario } from './scenarios/ShaderRecoveryScenario';
import { TextureScenario } from './scenarios/TextureScenario';
import { UniformsScenario } from './scenarios/UniformsScenario';
import { LifecycleScenario } from './scenarios/LifecycleScenario';
import { MixedPassesScenario } from './scenarios/MixedPassesScenario';
import { StorageWriteReadScenario } from './scenarios/StorageWriteReadScenario';
import { ErrorOverlayStyleScenario } from './scenarios/ErrorOverlayStyleScenario';

type Scenario =
	| 'runtime'
	| 'shader-recovery'
	| 'textures'
	| 'passes'
	| 'perf'
	| 'compute'
	| 'uniforms'
	| 'lifecycle'
	| 'mixed-passes'
	| 'storage-proof'
	| 'error-overlay-style';

function resolveScenario(): Scenario {
	const queryScenario = new URLSearchParams(window.location.search).get('scenario');

	if (
		queryScenario === 'shader-recovery' ||
		queryScenario === 'textures' ||
		queryScenario === 'passes' ||
		queryScenario === 'perf' ||
		queryScenario === 'compute' ||
		queryScenario === 'uniforms' ||
		queryScenario === 'lifecycle' ||
		queryScenario === 'mixed-passes' ||
		queryScenario === 'storage-proof' ||
		queryScenario === 'error-overlay-style'
	) {
		return queryScenario;
	}

	return 'runtime';
}

export function App() {
	const scenario = resolveScenario();

	return (
		<>
			<div data-testid="scenario">{scenario}</div>
			{scenario === 'runtime' ? <RuntimeScenario /> : null}
			{scenario === 'shader-recovery' ? <ShaderRecoveryScenario /> : null}
			{scenario === 'textures' ? <TextureScenario /> : null}
			{scenario === 'passes' ? <PassesScenario /> : null}
			{scenario === 'perf' ? <PerfScenario /> : null}
			{scenario === 'compute' ? <ComputeScenario /> : null}
			{scenario === 'uniforms' ? <UniformsScenario /> : null}
			{scenario === 'lifecycle' ? <LifecycleScenario /> : null}
			{scenario === 'mixed-passes' ? <MixedPassesScenario /> : null}
			{scenario === 'storage-proof' ? <StorageWriteReadScenario /> : null}
			{scenario === 'error-overlay-style' ? <ErrorOverlayStyleScenario /> : null}
		</>
	);
}
