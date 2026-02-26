<script lang="ts">
	import { useFrame } from 'fragkit';

	useFrame(({ time, setUniform }) => {
		const phase = time * 0.65;
		const intensity = 0.5 + 0.5 * Math.sin(time * 1.2);

		setUniform('phase', phase);
		setUniform('intensity', intensity);
	});
</script>
