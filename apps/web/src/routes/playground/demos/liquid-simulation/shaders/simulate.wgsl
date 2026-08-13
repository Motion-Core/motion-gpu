@compute @workgroup_size(8, 8)
fn compute(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(uWaveNext);
    if any(id.xy >= size) { return; }

    let p = vec2i(id.xy);
    let maxCoord = vec2i(size) - 1;
    let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
    let state = textureLoad(uWavePrevious, p, 0).xy;
    let left = textureLoad(uWavePrevious, max(p - vec2i(1, 0), vec2i(0)), 0).x;
    let right = textureLoad(uWavePrevious, min(p + vec2i(1, 0), maxCoord), 0).x;
    let down = textureLoad(uWavePrevious, max(p - vec2i(0, 1), vec2i(0)), 0).x;
    let up = textureLoad(uWavePrevious, min(p + vec2i(0, 1), maxCoord), 0).x;

    let medium = textureSampleLevel(uMedium, uMediumSampler, uv, 0.0).r;
    let laplacian = left + right + down + up - state.x * 4.0;
    let propagation = mix(0.145, 0.235, medium);
    var velocity = (state.y + laplacian * propagation) * mix(0.986, 0.992, medium);

    let pointerDelta = uv - motiongpuUniforms.uPointer;
    let pointerPulse = exp(-dot(pointerDelta, pointerDelta) * 640.0)
        * sin(motiongpuFrame.time * 1.0)
        * motiongpuUniforms.uPointerEnergy
        * 0.012;

    velocity += pointerPulse;

    let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    velocity *= smoothstep(0.0, 0.025, edge);
    let height = (state.x + velocity) * 0.9975;
    textureStore(uWaveNext, id.xy, vec4f(height, velocity, medium, 1.0));
}
