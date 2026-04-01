// Svelte and React variants are identical for simple FragCanvas pass usage.
// Both use the same JS API for pass objects; only the component syntax differs.

export const multiPassSvelte = `<FragCanvas {material} passes={[bloomPrefilter, gamma]} />`;

export const multiPassReact = `<FragCanvas material={material} passes={[bloomPrefilter, gamma]} />`;

export const computePassSvelte = `<FragCanvas {material} passes={[simulate, bloomPrefilter, gamma]} />`;

export const computePassReact = `<FragCanvas material={material} passes={[simulate, bloomPrefilter, gamma]} />`;
