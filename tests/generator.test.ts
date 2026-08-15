import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { generateConcepts } from '../src/generator.ts';
import { buildTransmittedEvidenceIndex, parseAndValidateInventionOutput } from '../src/output-contract.ts';
import { fixtureProvider, ProviderError } from '../src/provider.ts';
import { RequestValidationError, validateRequest } from '../src/request.ts';
import type { GenerationProvider } from '../src/types.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const request = JSON.parse(
  readFileSync(resolve(root, 'tests/fixtures/request.json'), 'utf8'),
);
const raw = readFileSync(
  resolve(root, 'tests/fixtures/model-response.json'),
  'utf8',
);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test('standalone pipeline stages a valid grounded concept', async () => {
  const result = await generateConcepts(request, fixtureProvider(raw));
  assert.equal(result.schema_version, 'sentra-concept-generator-result-v1');
  assert.equal(result.result_type, 'CONCEPTS_STAGED');
  assert.equal(result.contract_status, 'VALID_WITH_CONCEPTS');
  assert.equal(result.counters.concepts_staged, 1);
  assert.equal(result.counters.concepts_rejected, 0);
  assert.equal(result.staging?.survivors[0].provenance[0], 'Synthetic Duration Benchmark Rebalancing Study');
  assert.equal(result.staging?.survivors[0].evidence_link_class, 'MODEL_PROPOSED_PACKET_LINK');
});

test('valid zero is a successful, non-staging outcome', async () => {
  const zero = JSON.stringify({
    schema_version: 'mechanism-invention-output-v1',
    concepts: [],
    no_concept_reason: 'The packet does not support an executable concept.',
  });
  const result = await generateConcepts(request, fixtureProvider(zero));
  assert.equal(result.result_type, 'VALID_ZERO');
  assert.equal(result.contract_status, 'VALID_ZERO');
  assert.equal(result.staging, null);
  assert.equal(result.counters.concepts_staged, 0);
});

test('malformed model output fails closed as an operational failure', async () => {
  const result = await generateConcepts(
    request,
    fixtureProvider('not strict JSON'),
  );
  assert.equal(result.result_type, 'OPERATIONAL_FAILURE');
  assert.equal(result.contract_status, 'NOT_REACHED');
  assert.equal(result.counters.concepts_staged, 0);
});

test('tampered input passage hashes are rejected before provider execution', async () => {
  const tampered = clone(request);
  tampered.transmitted_sources[0].packets[0].passage += ' tampered';
  await assert.rejects(
    generateConcepts(tampered, fixtureProvider(raw)),
    (error: unknown) =>
      error instanceof RequestValidationError &&
      error.issues.some((issue) => issue.includes('does not match passage bytes')),
  );
});

test('request configuration rejects unsafe or incomplete limits', () => {
  const invalid = clone(request);
  invalid.max_concepts = 0;
  assert.throws(
    () => validateRequest(invalid),
    (error: unknown) =>
      error instanceof RequestValidationError &&
      error.issues.includes('max_concepts must be an integer from 1 through 20'),
  );
});

test('provider provenance mismatch is rejected', async () => {
  const provider: GenerationProvider = {
    descriptor: {
      provider_id: 'declared-provider',
      model_id: 'declared-model',
      execution_origin: 'CUSTOM',
      timeout_ms: 1000,
    },
    async generate() {
      return {
        raw,
        provider_id: 'different-provider',
        model_id: 'declared-model',
        execution_origin: 'CUSTOM',
      };
    },
  };
  await assert.rejects(
    generateConcepts(request, provider),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === 'PROVIDER_PROVENANCE_MISMATCH',
  );
});

test('untransmitted packet references are rejected by the grounding contract', () => {
  const changed = JSON.parse(raw);
  changed.concepts[0].evidence_refs[0].packet_id = 'not-transmitted';
  const index = buildTransmittedEvidenceIndex(request.transmitted_sources);
  const result = parseAndValidateInventionOutput(JSON.stringify(changed), index);
  assert.equal(result.contract_status, 'CONTRACT_REJECTED');
  assert.ok(result.rejection_codes.includes('OUTPUT_PACKET_ID_NOT_TRANSMITTED'));
});

test('normalization/dedup rejects a near-restatement from the live rotation', async () => {
  const duplicated = clone(request);
  duplicated.rotation = [
    {
      id: 'existing-duration-benchmark-weight-transition',
      concept: 'Scheduled Treasury index rebalancing benchmark weight transition next-session return',
      source_class: 'academic',
    },
  ];
  const result = await generateConcepts(duplicated, fixtureProvider(raw));
  assert.equal(result.result_type, 'NO_APPROVABLE_CONCEPT');
  assert.equal(result.counters.duplicates, 1);
  assert.equal(result.staging?.survivors.length, 0);
});
