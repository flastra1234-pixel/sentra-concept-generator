import { sha256 } from './canonical-json.ts';
import {
  REQUEST_SCHEMA,
  type GeneratorRequest,
  type Lesson,
  type RotationConcept,
  type TransmittedSource,
} from './types.ts';

export class RequestValidationError extends Error {
  readonly issues: string[];

  constructor(
    issues: string[],
    message = 'concept-generator request is invalid',
  ) {
    super(message);
    this.name = 'RequestValidationError';
    this.issues = issues;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isNonEmpty = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;
const isSha256 = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v);

export function validateRequest(value: unknown): GeneratorRequest {
  const issues: string[] = [];
  if (!isObject(value)) {
    throw new RequestValidationError(['top level must be an object']);
  }
  if (value.schema_version !== REQUEST_SCHEMA) {
    issues.push(`schema_version must be ${REQUEST_SCHEMA}`);
  }
  if (!isNonEmpty(value.request_id)) issues.push('request_id must be non-empty');
  if (
    !isNonEmpty(value.generated_at) ||
    !Number.isFinite(Date.parse(String(value.generated_at)))
  ) {
    issues.push('generated_at must be an ISO-8601 timestamp');
  }
  if (
    !Number.isInteger(value.max_concepts) ||
    Number(value.max_concepts) < 1 ||
    Number(value.max_concepts) > 20
  ) {
    issues.push('max_concepts must be an integer from 1 through 20');
  }
  if (
    value.staging_cap !== undefined &&
    (!Number.isInteger(value.staging_cap) ||
      Number(value.staging_cap) < 0 ||
      Number(value.staging_cap) > 20)
  ) {
    issues.push('staging_cap must be an integer from 0 through 20');
  }
  if (!Array.isArray(value.transmitted_sources) || value.transmitted_sources.length === 0) {
    issues.push('transmitted_sources must be a non-empty array');
  }
  if (!Array.isArray(value.rotation)) issues.push('rotation must be an array');
  if (!Array.isArray(value.lessons)) issues.push('lessons must be an array');

  const sourceIds = new Set<string>();
  const evidenceKeys = new Set<string>();
  for (const [i, source] of (
    Array.isArray(value.transmitted_sources)
      ? value.transmitted_sources
      : []
  ).entries()) {
    const prefix = `transmitted_sources[${i}]`;
    if (!isObject(source) || !isObject(source.record)) {
      issues.push(`${prefix}.record must be an object`);
      continue;
    }
    const record = source.record;
    if (!isNonEmpty(record.source_id)) {
      issues.push(`${prefix}.record.source_id must be non-empty`);
    } else if (sourceIds.has(record.source_id)) {
      issues.push(`${prefix}.record.source_id is duplicated`);
    } else sourceIds.add(record.source_id);
    for (const field of ['source_title', 'source_class', 'track', 'topic', 'content_tier']) {
      if (!isNonEmpty(record[field])) {
        issues.push(`${prefix}.record.${field} must be non-empty`);
      }
    }
    if (record.canonical_url !== null && typeof record.canonical_url !== 'string') {
      issues.push(`${prefix}.record.canonical_url must be string or null`);
    }
    if (record.extraction_status !== 'READY') {
      issues.push(`${prefix}.record.extraction_status must be READY`);
    }
    if (!Array.isArray(record.packets) || record.packets.length === 0) {
      issues.push(`${prefix}.record.packets must be non-empty`);
    }
    if (!Array.isArray(source.packets) || source.packets.length === 0) {
      issues.push(`${prefix}.packets must be non-empty`);
      continue;
    }
    const recordPackets = new Map(
      (Array.isArray(record.packets) ? record.packets : [])
        .filter(isObject)
        .map((packet) => [String(packet.packet_id ?? ''), packet]),
    );
    for (const [j, packet] of source.packets.entries()) {
      const pp = `${prefix}.packets[${j}]`;
      if (!isObject(packet)) {
        issues.push(`${pp} must be an object`);
        continue;
      }
      for (const field of [
        'packet_id',
        'evidence_tier',
        'claim_scope',
        'passage',
        'locator_type',
        'locator_value',
        'source_file_sha256',
        'normalized_content_sha256',
      ]) {
        if (!isNonEmpty(packet[field])) {
          issues.push(`${pp}.${field} must be non-empty`);
        }
      }
      if (!isSha256(packet.passage_sha256)) {
        issues.push(`${pp}.passage_sha256 must be a SHA-256 hex digest`);
      } else if (
        typeof packet.passage === 'string' &&
        sha256(packet.passage) !== packet.passage_sha256.toLowerCase()
      ) {
        issues.push(`${pp}.passage_sha256 does not match passage bytes`);
      }
      if (!isSha256(packet.source_file_sha256)) {
        issues.push(`${pp}.source_file_sha256 must be a SHA-256 hex digest`);
      }
      if (!isSha256(packet.normalized_content_sha256)) {
        issues.push(
          `${pp}.normalized_content_sha256 must be a SHA-256 hex digest`,
        );
      }
      const key = `${String(record.source_id)}\0${String(packet.packet_id)}`;
      if (evidenceKeys.has(key)) issues.push(`${pp} identity is duplicated`);
      evidenceKeys.add(key);
      const stored = recordPackets.get(String(packet.packet_id ?? ''));
      if (!stored) {
        issues.push(`${pp} is not present in record.packets`);
      } else if (
        stored.passage !== packet.passage ||
        stored.passage_sha256 !== packet.passage_sha256
      ) {
        issues.push(`${pp} differs from its record.packets copy`);
      }
    }
  }

  for (const [i, item] of (
    Array.isArray(value.rotation) ? value.rotation : []
  ).entries()) {
    if (!isObject(item) || !isNonEmpty(item.id)) {
      issues.push(`rotation[${i}].id must be non-empty`);
    }
  }
  for (const [i, item] of (
    Array.isArray(value.lessons) ? value.lessons : []
  ).entries()) {
    if (
      !isObject(item) ||
      !isNonEmpty(item.id) ||
      !isNonEmpty(item.kind) ||
      !isNonEmpty(item.mechanism) ||
      !isObject(item.steering) ||
      !isNonEmpty(item.steering.mode) ||
      !isNonEmpty(item.steering.text)
    ) {
      issues.push(
        `lessons[${i}] must carry id, kind, mechanism, and steering.mode/text`,
      );
    }
  }
  if (issues.length > 0) throw new RequestValidationError(issues);
  return value as unknown as GeneratorRequest;
}

export type {
  GeneratorRequest,
  Lesson,
  RotationConcept,
  TransmittedSource,
};
