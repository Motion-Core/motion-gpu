@compute @workgroup_size(8, 8)
fn compute(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(uFinal);
    if any(id.xy >= size) { return; }

    let p = vec2i(id.xy);
    let maxCoord = vec2i(size) - 1;
    let viewport = max(motiongpuFrame.resolution, vec2f(1.0));
    let gradientScale = vec2f(min(viewport.x, viewport.y)) / viewport;
    let center = textureLoad(uWave, p, 0);
    let smoothWeights = array<f32, 5>(1.0, 4.0, 6.0, 4.0, 1.0);
    let derivativeWeights = array<f32, 5>(-1.0, -2.0, 0.0, 2.0, 1.0);
    var heights: array<f32, 25>;

    for (var sampleY = 0u; sampleY < 5u; sampleY++) {
        for (var sampleX = 0u; sampleX < 5u; sampleX++) {
            let offset = vec2i(i32(sampleX) - 2, i32(sampleY) - 2);
            let coord = clamp(p + offset, vec2i(0), maxCoord);
            heights[sampleY * 5u + sampleX] = textureLoad(uWave, coord, 0).x;
        }
    }

    var rimGradient = vec2f(0.0);
    for (var kernelY = 0u; kernelY < 5u; kernelY++) {
        for (var kernelX = 0u; kernelX < 5u; kernelX++) {
            let height = heights[kernelY * 5u + kernelX];
            rimGradient += vec2f(
                derivativeWeights[kernelX] * smoothWeights[kernelY],
                smoothWeights[kernelX] * derivativeWeights[kernelY]
            ) * height;
        }
    }
    rimGradient *= gradientScale * 0.015625;

    let normal = normalize(vec3f(-rimGradient * 96.0, 1.0));
    let rimSlope = 1.0 - normal.z;
    let rim = pow(rimSlope, 2.2);
    let displacementStrength = clamp(abs(center.x) * 3.0, 0.0, 1.0);
    let displacementWave = smoothstep(0.0, 1.0, displacementStrength) * 100.45;
    let wave = displacementWave;

    let background = vec3f(0.0049, 0.00567, 0.0074);
    let glass = vec3f(0.001, 0.0011, 0.0013) * (0.25 + center.z * 0.7);
    let blue = vec3f(0.035, 0.23, 1.15);
    let violet = vec3f(0.28, 0.13, 1.3);
    let cyan = vec3f(0.08, 0.92, 1.45);
    var color = background + glass;
    color += mix(blue, violet, normal.x * 0.5 + 0.5) * wave * 0.062;
    color += blue * rim * 10.28;
    textureStore(uFinal, id.xy, vec4f(color, clamp(wave, 0.0, 1.0)));
}
