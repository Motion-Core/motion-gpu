import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/react';
import { fragment } from '../shader';

const material = defineMaterial({
	fragment
});

export default function App() {
	return <FragCanvas material={material} outputColorSpace="linear" dpr={1.0} />;
}
