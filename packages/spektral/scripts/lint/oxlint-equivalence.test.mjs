import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	assertCorrectnessMutationDiagnostics,
	assertPromiseMutationDiagnostics,
	oxlintPromiseRules
} from './oxlint-equivalence.mjs';

test('the Oxlint sentinel rejects a missing correctness diagnostic', () => {
	assert.throws(
		() => assertCorrectnessMutationDiagnostics([]),
		/Oxlint correctness mutation did not trigger eslint\/no-debugger/
	);
});

test('the Oxlint sentinel rejects a missing promise-safety diagnostic', () => {
	assert.throws(
		() =>
			assertPromiseMutationDiagnostics(oxlintPromiseRules.slice(1).map((ruleId) => ({ ruleId }))),
		/Oxlint promise mutation did not trigger typescript\/await-thenable/
	);
});
