import { sha256, stableStringify } from './canonical-json.ts';
import {
  parseInventedConcepts,
  stageInventedConcepts,
  type DrawSummary,
  type InventedConcept,
  type StagingDoc,
} from './concept-pipeline.ts';
import {
  buildTransmittedEvidenceIndex,
  parseAndValidateInventionOutput,
  type ValidatedInventionOutput,
} from './output-contract.ts';
import { renderGroundedPrompt, approxTokens } from './prompt.ts';
import { ProviderError } from './provider.ts';
import { validateRequest } from './request.ts';
import { learnWeights } from './source-class-score.ts';
import {
  GROUNDED_PROMPT_VERSION,
  RESULT_SCHEMA,
  type GenerationProvider,
  type GeneratorRequest,
  type ProviderResponse,
  type SourceClass,
} from './types.ts';
import { inspectContinuousRawResponse } from './worker-contract.ts';

export type GeneratorResultType =
  | 'CONCEPTS_STAGED'
  | 'VALID_ZERO'
  | 'NO_APPROVABLE_CONCEPT'
  | 'OPERATIONAL_FAILURE';

export interface GeneratorResult {
  schema_version: typeof RESULT_SCHEMA;
  request_id: string;
  request_sha256: string;
  generated_at: string;
  result_type: GeneratorResultType;
  contract_status: string;
  reason: string;
  provider: ProviderResponse;
  prompt: {
    version: typeof GROUNDED_PROMPT_VERSION;
    sha256: string;
    bytes: number;
    approximate_tokens: number;
    transmitted_source_ids: string[];
    source_prompt_bytes: number;
  };
  worker_claim: ReturnType<typeof inspectContinuousRawResponse>;
  contract: ValidatedInventionOutput;
  counters: {
    concepts_returned: number;
    concepts_valid: number;
    concepts_staged: number;
    concepts_rejected: number;
    downstream_rejections: number;
    dead_family_drops: number;
    duplicates: number;
    grounding_failures: number;
  };
  staging: StagingDoc | null;
}

export interface RenderedGeneratorPrompt {
  request: GeneratorRequest;
  prompt: string;
  prompt_sha256: string;
  prompt_bytes: number;
  approximate_tokens: number;
  transmitted_source_ids: string[];
  source_prompt_bytes: number;
}

const sourceClasses: readonly SourceClass[] = [
  'retail',
  'academic',
  'official',
];

function configuredStagingCap(request: GeneratorRequest): number {
  if (request.staging_cap !== undefined) return request.staging_cap;
  const configured = Number(process.env.SCG_STAGING_CAP ?? 4);
  return Number.isInteger(configured)
    ? Math.max(0, Math.min(20, configured))
    : 4;
}

export function renderGeneratorPrompt(value: unknown): RenderedGeneratorPrompt {
  const request = validateRequest(value);
  const cap = Math.min(request.max_concepts, configuredStagingCap(request));
  const rendered = renderGroundedPrompt(
    request.transmitted_sources,
    request.rotation,
    cap,
  );
  const promptBytes = Buffer.byteLength(rendered.prompt, 'utf8');
  return {
    request,
    prompt: rendered.prompt,
    prompt_sha256: sha256(rendered.prompt),
    prompt_bytes: promptBytes,
    approximate_tokens: approxTokens(promptBytes),
    transmitted_source_ids: rendered.transmittedSourceIds,
    source_prompt_bytes: rendered.sourcePromptBytes,
  };
}

function assertProviderProvenance(
  provider: GenerationProvider,
  response: ProviderResponse,
): void {
  const expected = provider.descriptor;
  if (
    response.provider_id !== expected.provider_id ||
    response.model_id !== expected.model_id ||
    response.execution_origin !== expected.execution_origin
  ) {
    throw new ProviderError(
      'PROVIDER_PROVENANCE_MISMATCH',
      'provider response provenance differs from its declared descriptor',
    );
  }
}

function operational(
  request: GeneratorRequest,
  rendered: RenderedGeneratorPrompt,
  response: ProviderResponse,
  contract: ValidatedInventionOutput,
  code: string,
  reason: string,
): GeneratorResult {
  return resultBase(
    request,
    rendered,
    response,
    contract,
    'OPERATIONAL_FAILURE',
    code,
    reason,
    null,
  );
}

function countersFor(
  contract: ValidatedInventionOutput,
  staging: StagingDoc | null,
): GeneratorResult['counters'] {
  const drops = staging?.dropped ?? [];
  const overflow = staging?.overflow ?? 0;
  return {
    concepts_returned: contract.concepts_returned,
    concepts_valid: contract.valid.length,
    concepts_staged: staging?.survivors.length ?? 0,
    concepts_rejected: contract.invalid.length + drops.length + overflow,
    downstream_rejections: drops.length + overflow,
    dead_family_drops: drops.filter((d) => d.drop.gate === 'ledger').length,
    duplicates: drops.filter((d) => d.drop.gate === 'dedup').length,
    grounding_failures: contract.invalid.filter((v) =>
      v.rejection_codes.some((c) => /EVIDENCE|GROUND|SOURCE|PACKET/i.test(c)),
    ).length,
  };
}

function resultBase(
  request: GeneratorRequest,
  rendered: RenderedGeneratorPrompt,
  response: ProviderResponse,
  contract: ValidatedInventionOutput,
  resultType: GeneratorResultType,
  contractStatus: string,
  reason: string,
  staging: StagingDoc | null,
): GeneratorResult {
  return {
    schema_version: RESULT_SCHEMA,
    request_id: request.request_id,
    request_sha256: sha256(stableStringify(request)),
    generated_at: request.generated_at,
    result_type: resultType,
    contract_status: contractStatus,
    reason,
    provider: response,
    prompt: {
      version: GROUNDED_PROMPT_VERSION,
      sha256: rendered.prompt_sha256,
      bytes: rendered.prompt_bytes,
      approximate_tokens: rendered.approximate_tokens,
      transmitted_source_ids: rendered.transmitted_source_ids,
      source_prompt_bytes: rendered.source_prompt_bytes,
    },
    worker_claim: inspectContinuousRawResponse(response.raw),
    contract,
    counters: countersFor(contract, staging),
    staging,
  };
}

/**
 * Pure orchestration boundary around the provider call. No controller-owned store,
 * lease, enrollment key, or production research database is read or written.
 */
export async function generateConcepts(
  value: unknown,
  provider: GenerationProvider,
): Promise<GeneratorResult> {
  const rendered = renderGeneratorPrompt(value);
  const request = rendered.request;
  const response = await provider.generate({
    prompt: rendered.prompt,
    request,
  });
  assertProviderProvenance(provider, response);

  const index = buildTransmittedEvidenceIndex(request.transmitted_sources);
  const contract = parseAndValidateInventionOutput(response.raw, index);
  if (
    !contract.parsed ||
    !contract.envelope_ok ||
    ['SCHEMA_NONCOMPLIANT', 'CONTRACT_REJECTED'].includes(
      contract.contract_status,
    )
  ) {
    return operational(
      request,
      rendered,
      response,
      contract,
      contract.contract_status,
      `generation output is not admissible evidence (${[
        ...contract.envelope_errors,
        ...contract.rejection_codes,
      ].join(',') || contract.outcome})`,
    );
  }

  if (contract.contract_status === 'VALID_ZERO') {
    return resultBase(
      request,
      rendered,
      response,
      contract,
      'VALID_ZERO',
      contract.contract_status,
      contract.no_concept_reason ?? 'provider returned a valid zero',
      null,
    );
  }

  const validById = new Map(
    contract.valid.map((valid) => [valid.concept_id, valid]),
  );
  const sourceTitles = new Map(
    request.transmitted_sources.map((source) => [
      source.record.source_id,
      source.record.source_title,
    ]),
  );
  const concepts: InventedConcept[] = parseInventedConcepts(response.raw)
    .filter((concept) => validById.has(concept.id))
    .map((concept) => {
      const valid = validById.get(concept.id)!;
      const provenance = [
        ...new Set(
          valid.evidence_refs
            .map((ref) => sourceTitles.get(ref.source_id))
            .filter((title): title is string => Boolean(title)),
        ),
      ];
      return {
        ...concept,
        provenance,
        evidence_refs: valid.evidence_refs,
        mechanism_atoms: valid.mechanism_atoms,
        evidence_link_class: valid.evidence_link_class,
        concept_evidence_label: valid.concept_evidence_label,
        semantic_review_required: true,
      };
    });

  const learned = learnWeights(request.rotation);
  const drawSummary: DrawSummary[] = sourceClasses.map((source_class) => {
    const count = request.transmitted_sources.filter(
      (source) => source.record.source_class === source_class,
    ).length;
    return {
      source_class,
      weight: learned.draw[source_class] ?? 0,
      available: count,
      selected: count,
    };
  });
  const staging = stageInventedConcepts({
    concepts,
    lessons: request.lessons,
    rotation: request.rotation,
    board: learned.board,
    draw: learned.draw,
    drawSummary,
    generatedAt: request.generated_at,
    since: request.generated_at,
    scanned: request.transmitted_sources.length,
    cap: Math.min(request.max_concepts, configuredStagingCap(request)),
    seededTitles: request.transmitted_sources.map(
      (source) => source.record.source_title,
    ),
  });
  const staged = staging.survivors.length;
  return resultBase(
    request,
    rendered,
    response,
    contract,
    staged > 0 ? 'CONCEPTS_STAGED' : 'NO_APPROVABLE_CONCEPT',
    contract.contract_status,
    staged > 0
      ? `${staged} packet-bound concept(s) staged for operator semantic review`
      : `all ${concepts.length} grounded concept(s) rejected by existing economic/provenance/falsifier/dead-family/dedup gates`,
    staging,
  );
}
