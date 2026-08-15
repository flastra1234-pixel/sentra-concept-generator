import {
  BAR_DIRECTIONS,
  CONDITION_KINDS,
  CORRECTED_SE_METHODS,
  EFFECT_UNITS,
  LB_RULES,
  SIGNAL_KINDS,
  STATISTICS,
} from './falsifier-spec.ts';
import {
  GROUNDED_PROMPT_VERSION,
  type TransmittedSource,
} from './types.ts';

const bytes = (s: string): number => Buffer.byteLength(s, 'utf8');

const ABSTRACT_LIMITATION = [
  'EVIDENCE TIER: ABSTRACT',
  'CLAIM SCOPE: ABSTRACT_ONLY',
  '',
  'This passage is an abstract. Use only what is explicitly present in the supplied passage.',
  'Do not infer methods, findings, mechanisms, details, or causal links from an unseen full paper.',
  'This packet cannot by itself establish DOCUMENTED_CHAIN or full structural verification.',
].join('\n');

const OUTPUT_ENVELOPE_INSTRUCTION = [
  'OUTPUT CONTRACT — mechanism-invention-output-v1. Return EXACTLY ONE strict JSON object and nothing',
  'else: no prose, no markdown fence, no preamble, no trailing commentary, no second JSON object.',
  '',
  'Shape:',
  '{',
  '  "schema_version": "mechanism-invention-output-v1",',
  '  "concepts": [ ... ],',
  '  "no_concept_reason": "string or null"',
  '}',
  '',
  'Rules:',
  '- schema_version MUST be exactly "mechanism-invention-output-v1".',
  '- concepts MUST be an array.',
  '- Return concepts: [] when the supplied evidence does not support a useful concept. A valid',
  '  zero-concept response is compliant and PREFERABLE to invented provenance.',
  '- When concepts is empty, no_concept_reason MUST be a nonempty string.',
  '- When concepts is non-empty, no_concept_reason MUST be null.',
  '',
  'Each concept MUST carry (in addition to the concept fields id, slot, family, concept,',
  'economic_counterparty, persistence_reason, cheapest_falsifier, transmission_channel, falsifier_spec):',
  '  "evidence_refs": [ {',
  '     "evidence_ref_id": "concept-local unique id",',
  '     "source_id": "<exact transmitted source_id>",',
  '     "packet_id": "<exact transmitted packet_id>",',
  '     "evidence_tier": "<copy the packet EVIDENCE_TIER exactly>",',
  '     "claim_scope": "<copy the packet CLAIM_SCOPE exactly>",',
  '     "locator_type": "<copy the packet LOCATOR type exactly>",',
  '     "locator_value": "<copy the packet LOCATOR value exactly>",',
  '     "passage_echo": "<copy the packet PASSAGE exactly — for audit>"',
  '  } ],',
  '  "mechanism_atoms": [ {',
  '     "atom_type": "<one canonical atom type>",',
  '     "claim": "<your proposed claim>",',
  '     "evidence_ref_ids": ["<one or more evidence_ref_id values from THIS concept>"]',
  '  } ]',
  '',
  '- evidence_refs MUST be non-empty. mechanism_atoms MUST be non-empty. Every atom MUST reference at',
  '  least one evidence_ref_id that exists in the SAME concept.',
  '- Use the EXACT source_id and packet_id supplied below. A source title is NOT provenance. A URL is',
  '  NOT provenance. A quoted passage without its packet_id is invalid. A packet_id without its exact',
  '  source_id is invalid.',
  '- Packet identity is determined by source_id and packet_id; copy evidence_tier, claim_scope,',
  '  locator_type and locator_value EXACTLY from the supplied packet.',
  '- passage_echo is for audit; copy the supplied passage exactly.',
  '- Partial mechanism chains are allowed; six atom types are NOT required. Do not invent missing links.',
  '- ABSTRACT evidence stays ABSTRACT_ONLY and cannot claim DOCUMENTED_CHAIN. Return zero concepts',
  '  rather than unsupported concepts. General model knowledge is not evidence.',
].join('\n');

export const FALSIFIER_SPEC_PROMPT_EXAMPLE = {
  dataset: { instruments: ['zn'], surface: 'daily' },
  signal: { kind: 'trailing_return', params: {} },
  condition: { kind: 'none' },
  response: { kind: 'forward_return', params: {} },
  statistic: 'mean_diff_vs_unconditional',
  pooling: { mode: 'single', series: ['zn'] },
  bar: {
    direction: 'positive',
    t_min: 2.0,
    min_effect: 0,
    effect_unit: 'bp',
    lb_rule: 'gt0',
  },
  min_n: 100,
  orthogonalisation: {
    controls: ['overnight_trailing_return'],
    kill_t_min: 1.5,
  },
} as const;

const FALSIFIER_SPEC_INSTRUCTION = [
  'FALSIFIER_SPEC — every concept MUST carry a COMPLETE, machine-readable falsifier_spec OBJECT (not a',
  'paragraph). An incomplete object is REFUSED at staging. Do not omit any field. The falsifier must be',
  'EXECUTABLE and capable of DISPROVING the mechanism. Do not invent unsupported details merely to',
  'satisfy the schema — if the evidence cannot support a complete, executable falsifier, return',
  'concepts: [] with a meaningful no_concept_reason instead.',
  '',
  'Required fields (exact vocabulary):',
  '  dataset.surface        : "1m" | "daily"',
  '  dataset.instruments    : non-empty array of registry symbols the harness can LOAD for that surface',
  '                           (dataset identifies the DATA required to run the test — e.g. daily "zn",',
  '                            "gc", "spy-us", "qqq-us"; 1m uses the intraday instrument set). A symbol',
  '                            the harness cannot load makes the whole spec useless.',
  `  signal.kind            : one of ${SIGNAL_KINDS.join(' | ')}`,
  '  signal.params          : object (may be {}, but the key MUST be present)',
  `  condition.kind         : one of ${CONDITION_KINDS.join(' | ')}`,
  '  condition.params       : optional object',
  `  response.kind          : one of ${SIGNAL_KINDS.join(' | ')}`,
  '  response.params        : object (present, may be {})',
  `  statistic              : one of ${STATISTICS.join(' | ')}`,
  '  pooling.mode           : "single" | "pooled"   (MANDATORY, no default)',
  '  pooling.series         : non-empty array of series names',
  `  pooling.corrected      : REQUIRED only when mode is "pooled" (OMIT it for single): { method: one of`,
  `                           ${CORRECTED_SE_METHODS.join(' | ')}, t_min: >0, min_effective_n: >=1, per_series_breakdown: true }`,
  `  bar.direction          : one of ${BAR_DIRECTIONS.join(' | ')}`,
  '  bar.t_min              : positive number (t threshold)',
  '  bar.min_effect         : finite number (0 is allowed)',
  `  bar.effect_unit        : one of ${EFFECT_UNITS.join(' | ')}`,
  `  bar.lb_rule            : one of ${LB_RULES.join(' | ')}`,
  '  min_n                  : integer >= 1 (below this the test is INCONCLUSIVE)',
  '  orthogonalisation.controls   : non-empty array naming the trailing-path controls to strip',
  '  orthogonalisation.kill_t_min : positive number (if the residual t falls below this the "edge" was',
  '                                 just re-labelled price)',
  '',
  'One STRUCTURALLY VALID example (single-series — copy this SHAPE, adapt values to the mechanism):',
  JSON.stringify(FALSIFIER_SPEC_PROMPT_EXAMPLE),
].join('\n');

/**
 * Byte-identical extraction of Sentra's GROUNDED_SOURCE_PROMPT_V2 renderer.
 */
export function renderGroundedPrompt(
  transmitted: readonly TransmittedSource[],
  rotation: ReadonlyArray<{ id: string }>,
  stagedCap: number,
): {
  prompt: string;
  transmittedSourceIds: string[];
  sourcePromptBytes: number;
} {
  const parts: string[] = [];
  parts.push(
    'You are the INVENT stage of a standing corpus->mechanism loop. Propose GENUINELY NEW trading',
  );
  parts.push(
    'mechanisms GROUNDED ONLY in the supplied source passages below. General model knowledge is not',
  );
  parts.push(
    'evidence. Return zero concepts when the evidence cannot support a useful concept.',
  );
  parts.push('');
  parts.push(OUTPUT_ENVELOPE_INSTRUCTION);
  parts.push('');
  parts.push(FALSIFIER_SPEC_INSTRUCTION);
  parts.push('');
  const ids: string[] = [];
  let sourceBytes = 0;
  for (const t of transmitted) {
    const r = t.record;
    ids.push(r.source_id);
    parts.push('='.repeat(60));
    parts.push(`SOURCE_ID: ${r.source_id}`);
    parts.push(`TITLE: ${r.source_title}`);
    parts.push(
      `SOURCE_CLASS: ${r.source_class}   TRACK: ${r.track}   TOPIC: ${r.topic}`,
    );
    if (r.canonical_url) parts.push(`URL: ${r.canonical_url}`);
    parts.push(`CONTENT_TIER: ${r.content_tier}`);
    parts.push(`SOURCE_FILE_SHA256: ${r.source_file_sha256}`);
    parts.push(
      `NORMALIZED_CONTENT_SHA256: ${r.normalized_content_sha256}`,
    );
    for (const p of t.packets) {
      parts.push('-'.repeat(40));
      parts.push(`PACKET_ID: ${p.packet_id}`);
      parts.push(
        `EVIDENCE_TIER: ${p.evidence_tier}   CLAIM_SCOPE: ${p.claim_scope}`,
      );
      parts.push(`LOCATOR: ${p.locator_type} ${p.locator_value}`);
      if (p.evidence_tier === 'ABSTRACT') parts.push(ABSTRACT_LIMITATION);
      parts.push('PASSAGE:');
      parts.push(p.passage);
      sourceBytes += bytes(p.passage);
    }
    parts.push('');
  }
  parts.push('='.repeat(60));
  parts.push('DEDUP — do not restate any of these live rotation concepts:');
  parts.push(rotation.map((c) => `  - ${c.id}`).join('\n'));
  parts.push('');
  parts.push(
    `Emit AT MOST ${stagedCap} concepts, best first, under the OUTPUT CONTRACT above`,
  );
  parts.push(
    `(${GROUNDED_PROMPT_VERSION} / mechanism-invention-output-v1). Exactly one strict JSON`,
  );
  parts.push('object, no prose, no markdown fence.');
  return {
    prompt: parts.join('\n'),
    transmittedSourceIds: [...new Set(ids)],
    sourcePromptBytes: sourceBytes,
  };
}

export function approxTokens(promptBytes: number): number {
  return Math.ceil(promptBytes / 4);
}
