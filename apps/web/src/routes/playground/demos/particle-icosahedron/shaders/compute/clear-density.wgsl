const TEX_SIZE: u32 = 2056u;

@compute @workgroup_size(16, 16)
fn compute(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= TEX_SIZE || id.y >= TEX_SIZE) { return; }
  textureStore(densityMap, vec2u(id.xy), vec4f(0.0));
}
