// Portable test suite: imported office snapshots are intentionally kept outside Git.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const privateDataTests = new Set(['har-evidence.test.ts', 'editor-collector.test.ts', 'continuation.test.ts', 'backlog.test.ts']);
const tests = readdirSync('tests').filter(name => name.endsWith('.test.ts') && !privateDataTests.has(name)).sort().map(name => 'tests/' + name);
console.log('Source-only suite. Four imported-data suites require the separately provided evidence/ directory.');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...tests], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
