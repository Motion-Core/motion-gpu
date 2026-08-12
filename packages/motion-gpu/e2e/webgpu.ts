const linuxSwiftShaderArgs: string[] = [
	'--enable-unsafe-webgpu',
	'--use-webgpu-adapter=swiftshader',
	'--enable-dawn-features=allow_unsafe_apis',
	'--disable-dawn-features=use_dxc',
	'--enable-webgpu-developer-features',
	'--use-gpu-in-tests',
	'--enable-accelerated-2d-canvas'
];

const defaultSwiftShaderArgs: string[] = [
	'--enable-unsafe-webgpu',
	'--use-angle=swiftshader',
	'--enable-features=Vulkan',
	'--disable-vulkan-surface'
];

export const webgpuLaunchArgs =
	process.platform === 'linux' ? linuxSwiftShaderArgs : defaultSwiftShaderArgs;
