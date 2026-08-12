const linuxSwiftShaderArgs: string[] = [
	'--enable-unsafe-webgpu',
	'--use-webgpu-adapter=swiftshader',
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
