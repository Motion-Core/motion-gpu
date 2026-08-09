<script lang="ts">
	import { onMount } from 'svelte';
	import { Camera, Color, Mesh, Program, Renderer, Texture, Transform, Triangle, Vec2 } from 'ogl';
	import type { ColorRepresentation } from 'ogl';

	type Props = {
		/**
		 * The image source URL.
		 */
		image?: string;
		/** Render the built-in radial gradient instead of an image. */
		gradient?: boolean;
		backgroundColor?: ColorRepresentation;
		accentColor?: ColorRepresentation;
		/**
		 * Glass field rotation in degrees.
		 * @default 0
		 */
		rotation?: number;
		/**
		 * Strength of the glass refraction.
		 * @default 1
		 */
		refraction?: number;
		/**
		 * Amount of chromatic aberration (color splitting).
		 * @default 1
		 */
		chromaticAberration?: number;
		/**
		 * Width of the diagonal glass panels.
		 * @default 0.82
		 */
		panelWidth?: number;
		/**
		 * Frequency of the panel wave.
		 * @default 0.0
		 */
		waveFrequency?: number;
		/**
		 * Amplitude of the panel wave.
		 * @default 0.0
		 */
		waveAmplitude?: number;
		/**
		 * Animation speed multiplier.
		 * @default 0.65
		 */
		speed?: number;
	};

	let {
		image,
		gradient = false,
		backgroundColor = 'var(--background-inset)',
		accentColor = 'var(--accent)',
		rotation = 0,
		refraction = 1,
		chromaticAberration = 1,
		panelWidth = 0.82,
		waveFrequency = 0.0,
		waveAmplitude = 0.0,
		speed = 0.65
	}: Props = $props();

	type UniformState = {
		uTime: { value: number };
		uResolution: { value: Vec2 };
		uTextureSize: { value: Vec2 };
		uTexture: { value: Texture };
		uUseGradient: { value: number };
		uGradientBackground: { value: Color };
		uGradientAccent: { value: Color };
		uRotation: { value: number };
		uRefraction: { value: number };
		uChromaticAberration: { value: number };
		uPanelWidth: { value: number };
		uWaveFrequency: { value: number };
		uWaveAmplitude: { value: number };
	};

	let canvas = $state<HTMLCanvasElement>();
	let uniforms = $state.raw<UniformState>();
	let setImageSource = $state<(source: string) => void>();
	let updateGradientColors =
		$state<(background: ColorRepresentation, accent: ColorRepresentation) => void>();

	const vertexShader = `
		attribute vec2 uv;
		attribute vec2 position;
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = vec4(position, 0.0, 1.0);
		}
	`;

	const fragmentShader = `
		precision highp float;

		uniform float uTime;
		uniform vec2 uResolution;
		uniform vec2 uTextureSize;
		uniform sampler2D uTexture;
		uniform float uUseGradient;
		uniform vec3 uGradientBackground;
		uniform vec3 uGradientAccent;
		uniform float uRotation;
		uniform float uRefraction;
		uniform float uChromaticAberration;
		uniform float uPanelWidth;
		uniform float uWaveFrequency;
		uniform float uWaveAmplitude;
		varying vec2 vUv;

		const float PI = 3.141592653589793;

		vec2 rotate2(vec2 p, float angle) {
			float c = cos(angle);
			float s = sin(angle);
			return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
		}

		float smoothMinimum(float a, float b, float radius) {
			float blend = clamp(0.5 + 0.5 * (b - a) / radius, 0.0, 1.0);
			return mix(b, a, blend) - radius * blend * (1.0 - blend);
		}

		vec2 getCoverUV(vec2 uv, vec2 textureSize) {
			vec2 safeTexture = max(textureSize, vec2(1.0));
			vec2 s = uResolution / safeTexture;
			float scale = max(s.x, s.y);
			vec2 scaledSize = safeTexture * scale;
			vec2 offset = (uResolution - scaledSize) * 0.5;
			return (uv * uResolution - offset) / scaledSize;
		}

		vec2 transformUv(vec2 uv, float aspect, float rotation) {
			vec2 centered = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
			vec2 transformed = rotate2(centered, -rotation);
			return vec2(transformed.x / aspect + 0.5, transformed.y + 0.5);
		}

		vec4 panelOptics(vec2 uv, float panelWidth, float waveFrequency, float waveAmplitude) {
			float aspect = uResolution.x / max(uResolution.y, 1.0);
			float angle = 0.0;
			float cosA = cos(angle);
			float sinA = sin(angle);
			vec2 centered = uv - vec2(0.5);
			vec2 asp = vec2(centered.x * aspect, centered.y);
			float u = asp.x * cosA + asp.y * sinA;
			float v = -asp.x * sinA + asp.y * cosA;
			float frequency = 9.02 / max(panelWidth, 0.001);
			float cell = fract((u + sin(v * waveFrequency * PI * 2.0) * waveAmplitude) * frequency) - 0.5;
			float cellPos = cell * 2.0;
			float slope = sign(cellPos) * pow(max(abs(cellPos), 0.0001), 3.0);
			float refrU = -(slope * 3.37) * (0.5 / frequency);
			return vec4(cellPos, slope, refrU, frequency);
		}

		vec3 gradientField(vec2 uv) {
			float gradientDistance = length(vec2(uv.x - 0.5, 1.0 - uv.y) / vec2(1.0, 1.1));
			vec3 color = mix(
				uGradientBackground,
				uGradientAccent,
				smoothstep(0.27, 0.69, gradientDistance)
			);
			float vignetteDistance = length((uv - 0.5) / vec2(0.3, 0.5));
			float vignette = smoothstep(0.72, 1.0, vignetteDistance);
			return mix(color, uGradientBackground, vignette);
		}

		vec3 imageField(vec2 uv) {
			if (uUseGradient > 0.5) return gradientField(uv);
			return texture2D(uTexture, getCoverUV(uv, uTextureSize)).rgb;
		}

		vec3 refractedImage(vec2 uv, vec2 chroma) {
			float r = imageField(uv + chroma).r;
			float g = imageField(uv).g;
			float b = imageField(uv - chroma).b;
			return vec3(r, g, b);
		}

		void main() {
			float aspect = uResolution.x / max(uResolution.y, 1.0);
			float angle = 0.0;
			float cosA = cos(angle);
			float sinA = sin(angle);
			vec2 effectUv = transformUv(vUv, aspect, radians(uRotation));
			float animatedWave = uWaveAmplitude * (0.75 + 0.25 * sin(uTime * 0.22));
			vec4 optics = panelOptics(effectUv, uPanelWidth, uWaveFrequency, animatedWave);
			float slope = optics.y;
			float refrU = optics.z * uRefraction;
			vec2 refractedUv = vec2(
				vUv.x + (refrU * cosA) / aspect,
				vUv.y + refrU * sinA
			);
			float chromaU = refrU * 0.15 * uChromaticAberration;
			vec2 chroma = vec2((chromaU * cosA) / aspect, chromaU * sinA);
			vec3 color = refractedImage(refractedUv, chroma);
			float nz = sqrt(1.0 - min(slope * slope, 1.0));
			float halfLight = (-90.0 * PI / 180.0) * 0.5;
			float hx = sin(halfLight);
			float hy = cos(halfLight);
			float nDotH = max(slope * hx + nz * hy, 0.0);
			float shininess = exp2(8.0 - 0.11 * 7.0);
			float fresnel = pow(1.0 - nz, 5.0);
			float spec = pow(nDotH, shininess) * (0.04 + 0.96 * fresnel) * 2.0 * max(uRefraction, 0.0);
			vec3 finalColor = clamp(color + vec3(spec), vec3(0.0), vec3(1.0));
			if (uUseGradient > 0.5) {
				vec2 distanceToEdge = min(vUv, 1.0 - vUv);
				float edgeDistance = smoothMinimum(distanceToEdge.x, distanceToEdge.y, 0.08);
				float featherProgress = clamp(edgeDistance / 0.5, 0.0, 1.0);
				float edgeFeather = 1.0 - pow(1.0 - featherProgress, 3.0);
				finalColor = mix(uGradientBackground, finalColor, edgeFeather);
			}
			gl_FragColor = vec4(finalColor, 1.0);
		}
	`;

	$effect(() => {
		if (!uniforms) return;
		uniforms.uUseGradient.value = gradient ? 1 : 0;
		uniforms.uRotation.value = rotation;
		uniforms.uRefraction.value = refraction;
		uniforms.uChromaticAberration.value = chromaticAberration;
		uniforms.uPanelWidth.value = panelWidth;
		uniforms.uWaveFrequency.value = waveFrequency;
		uniforms.uWaveAmplitude.value = waveAmplitude;
	});

	$effect(() => {
		updateGradientColors?.(backgroundColor, accentColor);
	});

	$effect(() => {
		if (!setImageSource || !image) return;
		setImageSource(image);
	});

	onMount(() => {
		const targetCanvas = canvas;
		if (!targetCanvas) return;

		const renderer = new Renderer({
			canvas: targetCanvas,
			alpha: true,
			dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1
		});
		const gl = renderer.gl;
		gl.clearColor(0, 0, 0, 0);

		targetCanvas.style.width = '100%';
		targetCanvas.style.height = '100%';

		const camera = new Camera(gl);
		camera.position.z = 1;

		const scene = new Transform();
		const geometry = new Triangle(gl);
		const colorProbe = document.createElement('span');
		colorProbe.style.cssText =
			'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;';
		targetCanvas.parentElement?.append(colorProbe);
		const colorCanvas = document.createElement('canvas');
		colorCanvas.width = 1;
		colorCanvas.height = 1;
		const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });

		const resolveColor = (value: ColorRepresentation): Color => {
			if (typeof value !== 'string') return new Color(value);
			colorProbe.style.color = value;
			const resolved = window.getComputedStyle(colorProbe).color;
			if (!colorContext) return new Color(resolved);
			colorContext.clearRect(0, 0, 1, 1);
			colorContext.fillStyle = resolved;
			colorContext.fillRect(0, 0, 1, 1);
			const [red, green, blue] = colorContext.getImageData(0, 0, 1, 1).data;
			return new Color(red / 255, green / 255, blue / 255);
		};

		const imageTexture = new Texture(gl, {
			image: new Uint8Array([0, 0, 0, 255]),
			width: 1,
			height: 1,
			format: gl.RGBA,
			type: gl.UNSIGNED_BYTE,
			minFilter: gl.LINEAR,
			magFilter: gl.LINEAR,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
			generateMipmaps: false,
			flipY: true
		});

		const localUniforms: UniformState = {
			uTime: { value: 0 },
			uResolution: { value: new Vec2(1, 1) },
			uTextureSize: { value: new Vec2(1, 1) },
			uTexture: { value: imageTexture },
			uUseGradient: { value: gradient ? 1 : 0 },
			uGradientBackground: { value: new Color() },
			uGradientAccent: { value: new Color() },
			uRotation: { value: rotation },
			uRefraction: { value: refraction },
			uChromaticAberration: { value: chromaticAberration },
			uPanelWidth: { value: panelWidth },
			uWaveFrequency: { value: waveFrequency },
			uWaveAmplitude: { value: waveAmplitude }
		};
		uniforms = localUniforms;
		const syncGradientColors = (background: ColorRepresentation, accent: ColorRepresentation) => {
			localUniforms.uGradientBackground.value.copy(resolveColor(background));
			localUniforms.uGradientAccent.value.copy(resolveColor(accent));
		};
		updateGradientColors = syncGradientColors;
		syncGradientColors(backgroundColor, accentColor);

		const themeObserver = new MutationObserver(() => {
			syncGradientColors(backgroundColor, accentColor);
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style']
		});

		let imageToken = 0;
		const loadImage = (source: string) => {
			imageToken += 1;
			const token = imageToken;
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.decoding = 'async';
			img.onload = () => {
				if (token !== imageToken) return;
				imageTexture.image = img;
				localUniforms.uTextureSize.value.set(
					img.naturalWidth || img.width || 1,
					img.naturalHeight || img.height || 1
				);
			};
			img.src = source;
		};
		setImageSource = loadImage;

		const program = new Program(gl, {
			vertex: vertexShader,
			fragment: fragmentShader,
			uniforms: localUniforms,
			transparent: true,
			depthTest: false,
			depthWrite: false
		});

		const mesh = new Mesh(gl, { geometry, program });
		mesh.setParent(scene);

		let raf = 0;
		let previous = 0;
		const tick = (now: number) => {
			const w = Math.max(1, targetCanvas.clientWidth);
			const h = Math.max(1, targetCanvas.clientHeight);
			const bufW = Math.round(w * renderer.dpr);
			const bufH = Math.round(h * renderer.dpr);
			if (targetCanvas.width !== bufW || targetCanvas.height !== bufH) {
				targetCanvas.width = bufW;
				targetCanvas.height = bufH;
				renderer.width = w;
				renderer.height = h;
				renderer.state.viewport = { x: 0, y: 0, width: null, height: null };
				localUniforms.uResolution.value.set(w, h);
			}
			const delta = previous ? (now - previous) / 1000 : 0;
			previous = now;
			localUniforms.uTime.value += delta * speed;

			renderer.render({ scene, camera });
			raf = window.requestAnimationFrame(tick);
		};

		raf = window.requestAnimationFrame(tick);

		return () => {
			window.cancelAnimationFrame(raf);
			setImageSource = undefined;
			updateGradientColors = undefined;
			themeObserver.disconnect();
			colorProbe.remove();
			gl.deleteTexture(imageTexture.texture);
		};
	});
</script>

<canvas
	bind:this={canvas}
	class="absolute inset-0 block h-full w-full"
	style="width:100%;height:100%;"
	aria-hidden="true"
></canvas>
