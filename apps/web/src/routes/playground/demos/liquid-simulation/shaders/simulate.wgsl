const POINTER_FALLOFF: f32 = 2400.0;

fn distanceToSegment(point: vec2f, start: vec2f, end: vec2f) -> f32 {
    let segment = end - start;
    let segmentLengthSquared = dot(segment, segment);
    let closest = clamp(dot(point - start, segment) / max(segmentLengthSquared, 0.000001), 0.0, 1.0);
    return length(point - (start + segment * closest));
}

@compute @workgroup_size(8, 8)
fn compute(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(uWaveNext);
    if any(id.xy >= size) { return; }

    let p = vec2i(id.xy);
    let maxCoord = vec2i(size) - 1;
    let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
    let viewport = max(motiongpuFrame.resolution, vec2f(1.0));
    let simulationScale = vec2f(min(viewport.x, viewport.y)) / viewport;
    let state = textureLoad(uWavePrevious, p, 0).xy;
    let left = textureLoad(uWavePrevious, max(p - vec2i(1, 0), vec2i(0)), 0).x;
    let right = textureLoad(uWavePrevious, min(p + vec2i(1, 0), maxCoord), 0).x;
    let down = textureLoad(uWavePrevious, max(p - vec2i(0, 1), vec2i(0)), 0).x;
    let up = textureLoad(uWavePrevious, min(p + vec2i(0, 1), maxCoord), 0).x;

    let medium = textureSampleLevel(uMedium, uMediumSampler, uv, 0.0).r;
    let horizontalLaplacian = left + right - state.x * 2.0;
    let verticalLaplacian = down + up - state.x * 2.0;
    let laplacian = horizontalLaplacian * simulationScale.x * simulationScale.x
        + verticalLaplacian * simulationScale.y * simulationScale.y;
    let propagation = mix(0.345, 0.35, medium);
    var velocity = (state.y + laplacian * propagation) * mix(0.986, 0.992, medium);

    let scaledUv = uv / simulationScale;
    let pointerEnd = motiongpuUniforms.uPointer.xy / simulationScale;
    let pointerStart = motiongpuUniforms.uPointer.zw / simulationScale;
    let pointerTravel = length(pointerEnd - pointerStart);
    let pointerDistance = distanceToSegment(scaledUv, pointerStart, pointerEnd);
    let sweepNormalization = min(1.0, sqrt(3.14159265 / POINTER_FALLOFF)
        / max(pointerTravel, 0.000001));
    let pointerPulse = exp(-pointerDistance * pointerDistance * POINTER_FALLOFF)
        * sweepNormalization
        * sin(motiongpuFrame.time * 1.0)
        * motiongpuUniforms.uPointerEnergy
        * 0.012;

    velocity += pointerPulse;

    let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    velocity *= smoothstep(0.0, 0.025, edge);
    let height = (state.x + velocity) * 0.9975;
    textureStore(uWaveNext, id.xy, vec4f(height, velocity, medium, 1.0));
}
