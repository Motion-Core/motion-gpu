import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('app');
if (!container) {
	throw new Error('Expected #app container to exist');
}

createRoot(container).render(<App />);
