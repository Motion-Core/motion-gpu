// Svelte, React, and Vue variants are identical for simple FragCanvas pass usage.
// All use the same JS API for pass objects; only the component syntax differs.

export const multiPassSvelte = `<FragCanvas {material} passes={[bloomPrefilter, composite]} />`;

export const multiPassReact = `<FragCanvas material={material} passes={[bloomPrefilter, composite]} />`;

export const multiPassVue = `<FragCanvas :material="material" :passes="[bloomPrefilter, composite]" />`;

export const computePassSvelte = `<FragCanvas {material} passes={[simulate, bloomPrefilter, composite]} />`;

export const computePassReact = `<FragCanvas material={material} passes={[simulate, bloomPrefilter, composite]} />`;

export const computePassVue = `<FragCanvas :material="material" :passes="[simulate, bloomPrefilter, composite]" />`;
