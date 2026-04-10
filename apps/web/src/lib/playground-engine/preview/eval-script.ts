import type { BundleResult } from '../types';

export const buildEvalScript = (bundle: BundleResult, injectedJS = '') => {
	if (!bundle.client?.code) {
		return '';
	}

	return `
		${injectedJS}

		const __playground_container_id = 'app';
		const __ensure_playground_container = () => {
			let container = document.getElementById(__playground_container_id);
			if (!container) {
				document.body.innerHTML = '';
				container = document.createElement('div');
				container.id = __playground_container_id;
				document.body.appendChild(container);
			}
			container.style.width = '100%';
			container.style.height = '100%';
			container.style.position = 'relative';
			return container;
		};

		{
			const styles = document.querySelectorAll('style[id^=svelte-]');
			let i = styles.length;
			while (i--) styles[i].parentNode?.removeChild(styles[i]);

			if (window.__unmount_previous) {
				try {
					window.__unmount_previous();
				} catch (err) {
					console.error(err);
				}
			}

			const container = __ensure_playground_container();
			container.innerHTML = '';
		}

		const __repl_exports = ${bundle.client.code};
		{
			const { mount, unmount, App } = __repl_exports;
			const container = __ensure_playground_container();
			let component;
			try {
				component = mount(App, { target: container });
			} finally {
				window.__unmount_previous = () => {
					if (component) {
						unmount(component);
					}
				};
			}
		}
	`;
};
