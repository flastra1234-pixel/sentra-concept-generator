import { sha256, stableStringify } from './canonical-json.ts';

export interface WorkerConceptView {
  id: string;
  slot: string;
  concept: string;
}

export function parseRawConcepts(raw: string): WorkerConceptView[] {
  const text = String(raw ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const arr = (obj as { concepts?: unknown }).concepts;
  if (!Array.isArray(arr)) return [];
  const out: WorkerConceptView[] = [];
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const slot = typeof o.slot === 'string' ? o.slot.trim() : '';
    const concept = typeof o.concept === 'string' ? o.concept.trim() : '';
    if (!id || !slot || !concept) continue;
    out.push({ id, slot, concept });
  }
  return out;
}

export interface WorkerProcessedResult {
  response_sha256: string;
  concept_ids: string[];
  concept_count: number;
  contract_valid: boolean;
  output_hash: string;
}

export function processDailyRawResponse(raw: string): WorkerProcessedResult {
  const concepts = parseRawConcepts(raw);
  const conceptIds = concepts.map((c) => c.id).sort();
  const responseSha = sha256(raw);
  return {
    response_sha256: responseSha,
    concept_ids: conceptIds,
    concept_count: concepts.length,
    contract_valid: concepts.length > 0,
    output_hash: sha256(
      stableStringify({ response_sha256: responseSha, ids: conceptIds }),
    ),
  };
}

export interface ContinuousWorkerClaim extends WorkerProcessedResult {
  result_type:
    | 'CONCEPTS_STAGED'
    | 'VALID_ZERO'
    | 'OPERATIONAL_FAILURE';
  contract_status:
    | 'WORKER_ENVELOPE_OK'
    | 'WORKER_VALID_ZERO'
    | 'WORKER_MALFORMED';
}

export function inspectContinuousRawResponse(
  raw: string,
): ContinuousWorkerClaim {
  const base = processDailyRawResponse(raw);
  const text = String(raw ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return {
      ...base,
      contract_valid: false,
      result_type: 'OPERATIONAL_FAILURE',
      contract_status: 'WORKER_MALFORMED',
    };
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(
      text.slice(start, end + 1),
    ) as Record<string, unknown>;
  } catch {
    return {
      ...base,
      contract_valid: false,
      result_type: 'OPERATIONAL_FAILURE',
      contract_status: 'WORKER_MALFORMED',
    };
  }
  if (
    obj.schema_version !== 'mechanism-invention-output-v1' ||
    !Array.isArray(obj.concepts)
  ) {
    return {
      ...base,
      contract_valid: false,
      result_type: 'OPERATIONAL_FAILURE',
      contract_status: 'WORKER_MALFORMED',
    };
  }
  if (obj.concepts.length === 0) {
    const reason =
      typeof obj.no_concept_reason === 'string'
        ? obj.no_concept_reason.trim()
        : '';
    if (!reason) {
      return {
        ...base,
        contract_valid: false,
        result_type: 'OPERATIONAL_FAILURE',
        contract_status: 'WORKER_MALFORMED',
      };
    }
    return {
      ...base,
      contract_valid: true,
      result_type: 'VALID_ZERO',
      contract_status: 'WORKER_VALID_ZERO',
    };
  }
  if (base.concept_count !== obj.concepts.length) {
    return {
      ...base,
      contract_valid: false,
      result_type: 'OPERATIONAL_FAILURE',
      contract_status: 'WORKER_MALFORMED',
    };
  }
  return {
    ...base,
    contract_valid: true,
    result_type: 'CONCEPTS_STAGED',
    contract_status: 'WORKER_ENVELOPE_OK',
  };
}
