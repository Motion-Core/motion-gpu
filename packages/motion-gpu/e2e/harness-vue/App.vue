<script setup lang="ts">
import ComputeScenario from './scenarios/ComputeScenario.vue';
import LifecycleScenario from './scenarios/LifecycleScenario.vue';
import MixedPassesScenario from './scenarios/MixedPassesScenario.vue';
import PassesScenario from './scenarios/PassesScenario.vue';
import PerfScenario from './scenarios/PerfScenario.vue';
import RuntimeScenario from './scenarios/RuntimeScenario.vue';
import ShaderRecoveryScenario from './scenarios/ShaderRecoveryScenario.vue';
import TextureScenario from './scenarios/TextureScenario.vue';
import UniformsScenario from './scenarios/UniformsScenario.vue';

type Scenario =
	| 'runtime'
	| 'shader-recovery'
	| 'textures'
	| 'passes'
	| 'perf'
	| 'compute'
	| 'uniforms'
	| 'lifecycle'
	| 'mixed-passes';

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
		queryScenario === 'mixed-passes'
	) {
		return queryScenario;
	}

	return 'runtime';
}

const scenario = resolveScenario();
</script>

<template>
	<div data-testid="scenario">{{ scenario }}</div>
	<RuntimeScenario v-if="scenario === 'runtime'" />
	<ShaderRecoveryScenario v-if="scenario === 'shader-recovery'" />
	<TextureScenario v-if="scenario === 'textures'" />
	<PassesScenario v-if="scenario === 'passes'" />
	<PerfScenario v-if="scenario === 'perf'" />
	<ComputeScenario v-if="scenario === 'compute'" />
	<UniformsScenario v-if="scenario === 'uniforms'" />
	<LifecycleScenario v-if="scenario === 'lifecycle'" />
	<MixedPassesScenario v-if="scenario === 'mixed-passes'" />
</template>
