async function run(): Promise<void> {
	await 42;
}

debugger;

declare function register(callback: () => void): void;
register(async () => {});
run();
