import { ComputeScenario } from './scenarios/ComputeScenario';
import { PassesScenario } from './scenarios/PassesScenario';
import { PerfScenario } from './scenarios/PerfScenario';
import { RuntimeScenario } from './scenarios/RuntimeScenario';
import { ShaderRecoveryScenario } from './scenarios/ShaderRecoveryScenario';
import { TextureScenario } from './scenarios/TextureScenario';

type Scenario = 'runtime' | 'shader-recovery' | 'textures' | 'passes' | 'perf' | 'compute';

function resolveScenario(): Scenario {
	const queryScenario = new URLSearchParams(window.location.search).get('scenario');

	if (
		queryScenario === 'shader-recovery' ||
		queryScenario === 'textures' ||
		queryScenario === 'passes' ||
		queryScenario === 'perf' ||
		queryScenario === 'compute'
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
		</>
	);
}
