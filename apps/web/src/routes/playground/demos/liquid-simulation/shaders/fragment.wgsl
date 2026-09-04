fn frag(uv: vec2f) -> vec4f {
    let resolution = max(spektralFrame.resolution, vec2f(1.0));
    let texel = 1.0 / resolution;
    let center = textureSample(finalOutput, finalOutputSampler, uv);
    var bloom = vec3f(0.0);
    bloom += textureSample(finalOutput, finalOutputSampler, uv + texel * vec2f(5.0, 0.0)).rgb;
    bloom += textureSample(finalOutput, finalOutputSampler, uv - texel * vec2f(5.0, 0.0)).rgb;
    bloom += textureSample(finalOutput, finalOutputSampler, uv + texel * vec2f(0.0, 5.0)).rgb;
    bloom += textureSample(finalOutput, finalOutputSampler, uv - texel * vec2f(0.0, 5.0)).rgb;

    let p = uv * 2.0 - 1.0;
    var color = center.rgb + bloom * 0.12 * (0.32 + center.a);
    color = max(color, vec3f(0.0049, 0.00567, 0.0074));
    color = 1.0 - exp(-color * 1.24);
    return vec4f(color, 1.0);
}
