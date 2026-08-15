import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, 'src/cli.ts');
const request = resolve(root, 'tests/fixtures/request.json');
const response = resolve(root, 'tests/fixtures/model-response.json');

function run(args: string[], env = process.env) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  });
}

test('CLI validates a request file', () => {
  const result = run(['validate', '--input', request]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.valid, true);
  assert.equal(body.transmitted_sources, 1);
});

test('CLI executes the fixture provider over JSON files', () => {
  const result = run([
    'generate',
    '--provider',
    'fixture',
    '--input',
    request,
    '--response-file',
    response,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.result_type, 'CONCEPTS_STAGED');
  assert.equal(body.counters.concepts_staged, 1);
});

test('CLI supports JSON stdin for machine-to-machine invocation', () => {
  const result = spawnSync(
    process.execPath,
    [cli, 'validate', '--input', '-'],
    {
      cwd: root,
      input: readFileSync(request, 'utf8'),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).valid, true);
});

test('missing provider executable fails safely without staging output', () => {
  const result = run(
    ['generate', '--input', request],
    {
      ...process.env,
      SCG_PROVIDER: 'claude-cli',
      SCG_CLAUDE_CMD: resolve(root, 'tests/fixtures/definitely-not-a-provider.exe'),
      SCG_TIMEOUT_MS: '100',
    },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  const body = JSON.parse(result.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'PROVIDER_COMMAND_NOT_FOUND');
});

test('CLI help is self-contained', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /JSON input.*stdin/i);
});
