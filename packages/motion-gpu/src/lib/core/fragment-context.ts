/**
 * Fragment-local values exposed to material and pass shader functions.
 */
export const MOTIONGPU_FRAGMENT_CONTEXT_WGSL = `
struct MotionGPUFragment {
	uv: vec2f,
};

var<private> motiongpuFragment: MotionGPUFragment;
`;
