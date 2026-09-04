/**
 * Fragment-local values exposed to material and pass shader functions.
 */
export const SPEKTRAL_FRAGMENT_CONTEXT_WGSL = `
struct SpektralFragment {
	uv: vec2f,
};

var<private> spektralFragment: SpektralFragment;
`;
