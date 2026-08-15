import { createHash } from 'node:crypto';

import { MODEL_OUTPUT_SCHEMA, type TransmittedSource } from './types.ts';

const sha256Str = (s: string): string =>
  createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

export interface TransmittedEvidenceEntry {
  source_id: string;
  packet_id: string;
  evidence_tier: string;
  claim_scope: string;
  locator_type: string;
  locator_value: string;
  passage: string;
  passage_sha256: string;
  normalized_content_sha256: string;
  source_file_sha256: string;
}

export interface TransmittedEvidenceIndex {
  byKey: Map<string, TransmittedEvidenceEntry>;
  bySource: Map<string, Set<string>>;
  packetToSource: Map<string, string>;
  refCount: number;
  sha256: string;
}

export function evidenceKey(sourceId: string, packetId: string): string {
  return `${sourceId}\0${packetId}`;
}

export function buildTransmittedEvidenceIndex(
  transmitted: readonly TransmittedSource[],
): TransmittedEvidenceIndex {
  const byKey = new Map<string, TransmittedEvidenceEntry>();
  const bySource = new Map<string, Set<string>>();
  const packetToSource = new Map<string, string>();
  for (const t of transmitted) {
    const sid = t.record.source_id;
    for (const p of t.packets) {
      const entry: TransmittedEvidenceEntry = {
        source_id: sid,
        packet_id: p.packet_id,
        evidence_tier: p.evidence_tier,
        claim_scope: p.claim_scope,
        locator_type: p.locator_type,
        locator_value: p.locator_value,
        passage: p.passage,
        passage_sha256: p.passage_sha256,
        normalized_content_sha256: p.normalized_content_sha256,
        source_file_sha256: p.source_file_sha256,
      };
      byKey.set(evidenceKey(sid, p.packet_id), entry);
      let set = bySource.get(sid);
      if (!set) {
        set = new Set<string>();
        bySource.set(sid, set);
      }
      set.add(p.packet_id);
      if (!packetToSource.has(p.packet_id)) packetToSource.set(p.packet_id, sid);
    }
  }
  const sortedKeys = [...byKey.keys()].sort();
  const summary = sortedKeys
    .map((key) => {
      const e = byKey.get(key)!;
      return [
        e.source_id,
        e.packet_id,
        e.evidence_tier,
        e.claim_scope,
        e.locator_type,
        e.locator_value,
        e.passage_sha256,
      ].join('|');
    })
    .join('\n');
  return {
    byKey,
    bySource,
    packetToSource,
    refCount: byKey.size,
    sha256: sha256Str(summary),
  };
}

export type PassageEchoStatus =
  | 'EXACT'
  | 'DIAGNOSTIC_NORMALIZATION_MATCH'
  | 'MISMATCH';

export function diagnosticNormalize(
  s: string,
): { normalized: string; applied: string[] } {
  const applied: string[] = [];
  let out = String(s ?? '');
  const lf = out.replace(/\r\n?/g, '\n');
  if (lf !== out) applied.push('CRLF_CR_TO_LF');
  out = lf;
  const nbsp = out.replace(/\u00a0/g, ' ');
  if (nbsp !== out) applied.push('NBSP_TO_SPACE');
  out = nbsp;
  const nfc = out.normalize('NFC');
  if (nfc !== out) applied.push('NFC');
  return { normalized: nfc, applied };
}

export function classifyPassageEcho(
  echo: string,
  canonical: string,
): { status: PassageEchoStatus; applied: string[] } {
  if (echo === canonical) return { status: 'EXACT', applied: [] };
  const ne = diagnosticNormalize(echo);
  const nc = diagnosticNormalize(canonical);
  if (ne.normalized === nc.normalized) {
    return {
      status: 'DIAGNOSTIC_NORMALIZATION_MATCH',
      applied: [...new Set([...ne.applied, ...nc.applied])],
    };
  }
  return { status: 'MISMATCH', applied: [] };
}

export const OUTPUT_REJECTION_CODES = [
  'OUTPUT_SOURCE_ID_MISSING',
  'OUTPUT_SOURCE_ID_NOT_TRANSMITTED',
  'OUTPUT_PACKET_ID_MISSING',
  'OUTPUT_PACKET_ID_NOT_TRANSMITTED',
  'OUTPUT_PACKET_SOURCE_MISMATCH',
  'OUTPUT_EVIDENCE_TIER_MISMATCH',
  'OUTPUT_CLAIM_SCOPE_MISMATCH',
  'OUTPUT_LOCATOR_TYPE_MISMATCH',
  'OUTPUT_LOCATOR_VALUE_MISMATCH',
  'OUTPUT_EVIDENCE_REFS_EMPTY',
  'OUTPUT_ATOMS_EMPTY',
  'OUTPUT_ATOM_REFERENCE_MISSING',
  'OUTPUT_ATOM_REFERENCE_UNKNOWN',
  'OUTPUT_DUPLICATE_EVIDENCE_REF_ID',
  'OUTPUT_PASSAGE_ECHO_MISSING',
] as const;
export type OutputRejectionCode = (typeof OUTPUT_REJECTION_CODES)[number];

export const OUTPUT_DIAGNOSTIC_CODES = [
  'OUTPUT_PASSAGE_ECHO_EXACT',
  'OUTPUT_PASSAGE_ECHO_DIAGNOSTIC_NORMALIZATION_MATCH',
  'OUTPUT_PASSAGE_MISMATCH',
] as const;
export type OutputDiagnosticCode = (typeof OUTPUT_DIAGNOSTIC_CODES)[number];

export interface ValidatedEvidenceRef {
  evidence_ref_id: string;
  source_id: string;
  packet_id: string;
  evidence_tier: string;
  claim_scope: string;
  locator_type: string;
  locator_value: string;
  passage_echo: string;
  canonical_passage: string;
  passage_echo_status: PassageEchoStatus;
  passage_echo_sha256: string;
  canonical_passage_sha256: string;
  diagnostic_normalizations_applied: string[];
}

export interface ValidatedAtom {
  atom_type: string;
  claim: string;
  evidence_ref_ids: string[];
}

export interface ValidatedConcept {
  concept_id: string;
  concept: Record<string, unknown>;
  evidence_refs: ValidatedEvidenceRef[];
  mechanism_atoms: ValidatedAtom[];
  evidence_link_class: 'MODEL_PROPOSED_PACKET_LINK';
  concept_evidence_label:
    | 'ABSTRACT_SUPPORTED_HYPOTHESIS'
    | 'EVIDENCE_BOUND_PROPOSAL';
  semantic_review_required: true;
  diagnostic_codes: OutputDiagnosticCode[];
}

export interface InvalidConcept {
  index: number;
  concept_id: string | null;
  rejection_codes: OutputRejectionCode[];
  diagnostic_codes: OutputDiagnosticCode[];
}

export type OutputContractStatus =
  | 'NOT_REACHED'
  | 'VALID_ZERO'
  | 'VALID_WITH_CONCEPTS'
  | 'PARTIAL'
  | 'SCHEMA_NONCOMPLIANT'
  | 'CONTRACT_REJECTED';
export type OutputContractOutcome =
  | 'unparseable'
  | 'schema-noncompliant'
  | 'empty'
  | 'staged'
  | 'contract-rejected';

export interface ValidatedInventionOutput {
  parsed: boolean;
  envelope_ok: boolean;
  envelope_errors: string[];
  contract_status: OutputContractStatus;
  outcome: OutputContractOutcome;
  no_concept_reason: string | null;
  concepts_returned: number;
  valid: ValidatedConcept[];
  invalid: InvalidConcept[];
  evidence_refs_returned: number;
  evidence_refs_valid: number;
  evidence_refs_invalid: number;
  atoms_returned: number;
  atoms_valid: number;
  atoms_invalid: number;
  passage_echo_exact: number;
  passage_echo_normalized_only: number;
  passage_echo_mismatch: number;
  rejection_codes: OutputRejectionCode[];
  diagnostic_codes: OutputDiagnosticCode[];
  transmitted_evidence_index_sha256: string | null;
  transmitted_evidence_ref_count: number;
}

const asString = (v: unknown): string | null =>
  typeof v === 'string' ? v : null;

function validateConcept(
  c: Record<string, unknown>,
  index: TransmittedEvidenceIndex,
): {
  ok: boolean;
  concept_id: string | null;
  rejection: OutputRejectionCode[];
  diagnostic: OutputDiagnosticCode[];
  validated: ValidatedConcept | null;
  refsReturned: number;
  refsValid: number;
  refsInvalid: number;
  atomsReturned: number;
  atomsValid: number;
  atomsInvalid: number;
  echoExact: number;
  echoNorm: number;
  echoMismatch: number;
} {
  const rejection: OutputRejectionCode[] = [];
  const diagnostic: OutputDiagnosticCode[] = [];
  const conceptId = asString(c.id);
  const refsRaw = Array.isArray(c.evidence_refs) ? c.evidence_refs : [];
  const atomsRaw = Array.isArray(c.mechanism_atoms) ? c.mechanism_atoms : [];
  let refsValid = 0;
  let refsInvalid = 0;
  let atomsValid = 0;
  let atomsInvalid = 0;
  let echoExact = 0;
  let echoNorm = 0;
  let echoMismatch = 0;
  const push = (code: OutputRejectionCode): void => {
    if (!rejection.includes(code)) rejection.push(code);
  };
  const pushDiag = (code: OutputDiagnosticCode): void => {
    if (!diagnostic.includes(code)) diagnostic.push(code);
  };
  if (refsRaw.length === 0) push('OUTPUT_EVIDENCE_REFS_EMPTY');
  if (atomsRaw.length === 0) push('OUTPUT_ATOMS_EMPTY');

  const validatedRefs: ValidatedEvidenceRef[] = [];
  const localRefIds = new Set<string>();
  for (const raw of refsRaw) {
    const r =
      raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : {};
    let refBad = false;
    const refId = asString(r.evidence_ref_id) ?? '';
    if (refId) {
      if (localRefIds.has(refId)) {
        push('OUTPUT_DUPLICATE_EVIDENCE_REF_ID');
        refBad = true;
      } else localRefIds.add(refId);
    }
    const sourceId = asString(r.source_id);
    const packetId = asString(r.packet_id);
    if (!sourceId) {
      push('OUTPUT_SOURCE_ID_MISSING');
      refBad = true;
    }
    if (!packetId) {
      push('OUTPUT_PACKET_ID_MISSING');
      refBad = true;
    }
    let entry: TransmittedEvidenceEntry | undefined;
    if (sourceId && packetId) {
      entry = index.byKey.get(evidenceKey(sourceId, packetId));
      if (!entry) {
        if (!index.bySource.has(sourceId)) {
          push('OUTPUT_SOURCE_ID_NOT_TRANSMITTED');
          refBad = true;
        } else if (!index.packetToSource.has(packetId)) {
          push('OUTPUT_PACKET_ID_NOT_TRANSMITTED');
          refBad = true;
        } else {
          push('OUTPUT_PACKET_SOURCE_MISMATCH');
          refBad = true;
        }
      }
    }
    const passageEcho = asString(r.passage_echo);
    if (passageEcho === null) {
      push('OUTPUT_PASSAGE_ECHO_MISSING');
      refBad = true;
    }
    if (entry) {
      if (asString(r.evidence_tier) !== entry.evidence_tier) {
        push('OUTPUT_EVIDENCE_TIER_MISMATCH');
        refBad = true;
      }
      if (asString(r.claim_scope) !== entry.claim_scope) {
        push('OUTPUT_CLAIM_SCOPE_MISMATCH');
        refBad = true;
      }
      if (asString(r.locator_type) !== entry.locator_type) {
        push('OUTPUT_LOCATOR_TYPE_MISMATCH');
        refBad = true;
      }
      if (asString(r.locator_value) !== entry.locator_value) {
        push('OUTPUT_LOCATOR_VALUE_MISMATCH');
        refBad = true;
      }
      const echo = passageEcho ?? '';
      const echoClass = classifyPassageEcho(echo, entry.passage);
      if (echoClass.status === 'EXACT') {
        echoExact++;
        pushDiag('OUTPUT_PASSAGE_ECHO_EXACT');
      } else if (echoClass.status === 'DIAGNOSTIC_NORMALIZATION_MATCH') {
        echoNorm++;
        pushDiag('OUTPUT_PASSAGE_ECHO_DIAGNOSTIC_NORMALIZATION_MATCH');
      } else {
        echoMismatch++;
        pushDiag('OUTPUT_PASSAGE_MISMATCH');
      }
      validatedRefs.push({
        evidence_ref_id: refId,
        source_id: sourceId!,
        packet_id: packetId!,
        evidence_tier: entry.evidence_tier,
        claim_scope: entry.claim_scope,
        locator_type: entry.locator_type,
        locator_value: entry.locator_value,
        passage_echo: echo,
        canonical_passage: entry.passage,
        passage_echo_status: echoClass.status,
        passage_echo_sha256: sha256Str(echo),
        canonical_passage_sha256: entry.passage_sha256,
        diagnostic_normalizations_applied: echoClass.applied,
      });
    }
    if (refBad) refsInvalid++;
    else refsValid++;
  }

  const validatedAtoms: ValidatedAtom[] = [];
  for (const raw of atomsRaw) {
    const a =
      raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : {};
    const refIds = Array.isArray(a.evidence_ref_ids)
      ? a.evidence_ref_ids.filter((x): x is string => typeof x === 'string')
      : [];
    let atomBad = false;
    if (refIds.length === 0) {
      push('OUTPUT_ATOM_REFERENCE_MISSING');
      atomBad = true;
    } else if (!refIds.every((id) => localRefIds.has(id))) {
      push('OUTPUT_ATOM_REFERENCE_UNKNOWN');
      atomBad = true;
    }
    if (atomBad) atomsInvalid++;
    else {
      atomsValid++;
      validatedAtoms.push({
        atom_type: asString(a.atom_type) ?? '',
        claim: asString(a.claim) ?? '',
        evidence_ref_ids: refIds,
      });
    }
  }

  const ok = rejection.length === 0;
  let validated: ValidatedConcept | null = null;
  if (ok) {
    const allAbstract =
      validatedRefs.length > 0 &&
      validatedRefs.every(
        (v) =>
          v.evidence_tier === 'ABSTRACT' &&
          v.claim_scope === 'ABSTRACT_ONLY',
      );
    validated = {
      concept_id: conceptId ?? '',
      concept: c,
      evidence_refs: validatedRefs,
      mechanism_atoms: validatedAtoms,
      evidence_link_class: 'MODEL_PROPOSED_PACKET_LINK',
      concept_evidence_label: allAbstract
        ? 'ABSTRACT_SUPPORTED_HYPOTHESIS'
        : 'EVIDENCE_BOUND_PROPOSAL',
      semantic_review_required: true,
      diagnostic_codes: diagnostic,
    };
  }
  return {
    ok,
    concept_id: conceptId,
    rejection,
    diagnostic,
    validated,
    refsReturned: refsRaw.length,
    refsValid,
    refsInvalid,
    atomsReturned: atomsRaw.length,
    atomsValid,
    atomsInvalid,
    echoExact,
    echoNorm,
    echoMismatch,
  };
}

/** Strict, whole-response parser from the authoritative continuous path. */
export function parseAndValidateInventionOutput(
  raw: string,
  index: TransmittedEvidenceIndex,
): ValidatedInventionOutput {
  const base: ValidatedInventionOutput = {
    parsed: false,
    envelope_ok: false,
    envelope_errors: [],
    contract_status: 'NOT_REACHED',
    outcome: 'unparseable',
    no_concept_reason: null,
    concepts_returned: 0,
    valid: [],
    invalid: [],
    evidence_refs_returned: 0,
    evidence_refs_valid: 0,
    evidence_refs_invalid: 0,
    atoms_returned: 0,
    atoms_valid: 0,
    atoms_invalid: 0,
    passage_echo_exact: 0,
    passage_echo_normalized_only: 0,
    passage_echo_mismatch: 0,
    rejection_codes: [],
    diagnostic_codes: [],
    transmitted_evidence_index_sha256: index.sha256,
    transmitted_evidence_ref_count: index.refCount,
  };
  let obj: unknown;
  try {
    obj = JSON.parse(String(raw ?? '').trim());
  } catch {
    return base;
  }
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push('TOP_LEVEL_NOT_OBJECT');
  }
  const env =
    obj && typeof obj === 'object' && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : {};
  if (env.schema_version !== MODEL_OUTPUT_SCHEMA) {
    errors.push('SCHEMA_VERSION_MISMATCH');
  }
  if (!Array.isArray(env.concepts)) errors.push('CONCEPTS_NOT_ARRAY');
  const concepts = Array.isArray(env.concepts) ? env.concepts : [];
  const hasReason = Object.prototype.hasOwnProperty.call(
    env,
    'no_concept_reason',
  );
  const reason = env.no_concept_reason;
  if (!hasReason) errors.push('NO_CONCEPT_REASON_MISSING');
  if (concepts.length === 0) {
    if (!(typeof reason === 'string' && reason.trim().length > 0)) {
      errors.push('NO_CONCEPT_REASON_REQUIRED_WHEN_EMPTY');
    }
  } else if (reason !== null) {
    errors.push('NO_CONCEPT_REASON_MUST_BE_NULL_WHEN_CONCEPTS_PRESENT');
  }
  if (errors.length > 0) {
    return {
      ...base,
      parsed: true,
      envelope_errors: errors,
      outcome: 'schema-noncompliant',
      contract_status: 'SCHEMA_NONCOMPLIANT',
      no_concept_reason: typeof reason === 'string' ? reason : null,
    };
  }
  if (concepts.length === 0) {
    return {
      ...base,
      parsed: true,
      envelope_ok: true,
      outcome: 'empty',
      contract_status: 'VALID_ZERO',
      no_concept_reason: reason as string,
    };
  }

  const valid: ValidatedConcept[] = [];
  const invalid: InvalidConcept[] = [];
  const rejections = new Set<OutputRejectionCode>();
  const diagnostics = new Set<OutputDiagnosticCode>();
  let refsReturned = 0;
  let refsValid = 0;
  let refsInvalid = 0;
  let atomsReturned = 0;
  let atomsValid = 0;
  let atomsInvalid = 0;
  let echoExact = 0;
  let echoNorm = 0;
  let echoMismatch = 0;
  concepts.forEach((raw, indexNumber) => {
    const concept =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const v = validateConcept(concept, index);
    refsReturned += v.refsReturned;
    refsValid += v.refsValid;
    refsInvalid += v.refsInvalid;
    atomsReturned += v.atomsReturned;
    atomsValid += v.atomsValid;
    atomsInvalid += v.atomsInvalid;
    echoExact += v.echoExact;
    echoNorm += v.echoNorm;
    echoMismatch += v.echoMismatch;
    v.rejection.forEach((code) => rejections.add(code));
    v.diagnostic.forEach((code) => diagnostics.add(code));
    if (v.ok && v.validated) valid.push(v.validated);
    else {
      invalid.push({
        index: indexNumber,
        concept_id: v.concept_id,
        rejection_codes: v.rejection,
        diagnostic_codes: v.diagnostic,
      });
    }
  });
  const anyValid = valid.length > 0;
  const anyInvalid = invalid.length > 0;
  return {
    ...base,
    parsed: true,
    envelope_ok: true,
    contract_status: anyValid
      ? anyInvalid
        ? 'PARTIAL'
        : 'VALID_WITH_CONCEPTS'
      : 'CONTRACT_REJECTED',
    outcome: anyValid ? 'staged' : 'contract-rejected',
    no_concept_reason: null,
    concepts_returned: concepts.length,
    valid,
    invalid,
    evidence_refs_returned: refsReturned,
    evidence_refs_valid: refsValid,
    evidence_refs_invalid: refsInvalid,
    atoms_returned: atomsReturned,
    atoms_valid: atomsValid,
    atoms_invalid: atomsInvalid,
    passage_echo_exact: echoExact,
    passage_echo_normalized_only: echoNorm,
    passage_echo_mismatch: echoMismatch,
    rejection_codes: [...rejections],
    diagnostic_codes: [...diagnostics],
  };
}
