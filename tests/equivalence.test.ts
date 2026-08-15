import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { generateConcepts } from '../src/generator.ts';
import { fixtureProvider } from '../src/provider.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const request = JSON.parse(
  readFileSync(resolve(root, 'tests/fixtures/request.json'), 'utf8'),
);
const raw = readFileSync(
  resolve(root, 'tests/fixtures/model-response.json'),
  'utf8',
);
const digest = (value: unknown): string =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

test('deterministic stages match snapshots captured from Sentra b9db654', async () => {
  const result = await generateConcepts(request, fixtureProvider(raw));
  assert.equal(
    result.prompt.sha256,
    'c53685c3e976d1ff6141090536556f764c60762ba02caccba8255b947bd36a30',
    'GROUNDED_SOURCE_PROMPT_V2 changed',
  );
  assert.equal(
    digest(result.contract),
    '8defb2813c6f9717a4864b896951fa6bed36e7282260124f79b8c4074b4b35cf',
    'strict output-contract behavior changed',
  );
  assert.equal(
    digest(result.worker_claim),
    '851e3d08bd3f83b5fcfac49ab8c168fb9db6ac3e62d17dc3f806310e5fa7568a',
    'worker claim changed',
  );
  assert.equal(
    digest(result.staging),
    '843b7849aeab0158215c2ceb5eedf2c29dfb5709e23ac44a513a3c1eeb36cf79',
    'normalization/gate/dedup staging behavior changed',
  );
});
