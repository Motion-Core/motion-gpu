<script lang="ts">
	import RuntimeScenario from './scenarios/RuntimeScenario.svelte';
	import ShaderRecoveryScenario from './scenarios/ShaderRecoveryScenario.svelte';
	import TextureScenario from './scenarios/TextureScenario.svelte';
	import PassesScenario from './scenarios/PassesScenario.svelte';
	import PerfScenario from './scenarios/PerfScenario.svelte';
	import ComputeScenario from './scenarios/ComputeScenario.svelte';

	type Scenario = 'runtime' | 'shader-recovery' | 'textures' | 'passes' | 'perf' | 'compute';
	const queryScenario = new URLSearchParams(window.location.search).get('scenario');
	const scenario: Scenario =
		queryScenario === 'shader-recovery' ||
		queryScenario === 'textures' ||
		queryScenario === 'passes' ||
		queryScenario === 'perf' ||
		queryScenario === 'compute'
			? queryScenario
			: 'runtime';
</script>

<div data-testid="scenario">{scenario}</div>

{#if scenario === 'runtime'}
	<RuntimeScenario />
{:else if scenario === 'shader-recovery'}
	<ShaderRecoveryScenario />
{:else if scenario === 'textures'}
	<TextureScenario />
{:else if scenario === 'perf'}
	<PerfScenario />
{:else if scenario === 'compute'}
	<ComputeScenario />
{:else}
	<PassesScenario />
{/if}
