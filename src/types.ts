export const REQUEST_SCHEMA = 'sentra-concept-generator-request-v1';
export const RESULT_SCHEMA = 'sentra-concept-generator-result-v1';
export const MODEL_OUTPUT_SCHEMA = 'mechanism-invention-output-v1';
export const GROUNDED_PROMPT_VERSION = 'GROUNDED_SOURCE_PROMPT_V2';

export type SourceClass = 'retail' | 'academic' | 'official';
export type EvidenceTier = 'ABSTRACT' | 'TRANSCRIPT' | 'FULL_TEXT';
export type ClaimScope = 'ABSTRACT_ONLY' | 'SOURCE_PASSAGE';
export type LocatorType =
  | 'PARAGRAPH_SENTENCE'
  | 'SECTION_PARAGRAPH'
  | 'TRANSCRIPT_TIMESTAMP'
  | 'TRANSCRIPT_SEGMENT';

export interface EvidencePacket {
  packet_id: string;
  evidence_tier: EvidenceTier;
  claim_scope: ClaimScope;
  passage: string;
  passage_sha256: string;
  start_offset: number;
  end_offset: number;
  locator_type: LocatorType;
  locator_value: string;
  source_file_sha256: string;
  normalized_content_sha256: string;
  extraction_method: string;
}

export interface EvidenceRecord {
  schema_version: string;
  recorded_at: string;
  source_id: string;
  source_title: string;
  source_class: string;
  track: string;
  topic: string;
  canonical_url: string | null;
  source_path: string;
  source_file_sha256: string | null;
  normalized_content_sha256: string | null;
  source_schema: string;
  content_selector: string | null;
  content_tier: string;
  extractor_version: string;
  extraction_attempt: number;
  extraction_status: string;
  extraction_reason: string;
  retryable: boolean;
  manifest_version_key: string;
  packets: EvidencePacket[];
}

export interface TransmittedSource {
  record: EvidenceRecord;
  packets: EvidencePacket[];
}

export interface RotationConcept {
  id: string;
  concept?: string;
  source_class?: unknown;
}

export interface Lesson {
  id: string;
  kind: string;
  mechanism: string;
  scope?: string;
  cause_of_death?: string;
  cause_class?: string | null;
  steering: {
    mode: string;
    text: string;
    weight?: string;
  };
}

export interface GeneratorRequest {
  schema_version: typeof REQUEST_SCHEMA;
  request_id: string;
  generated_at: string;
  max_concepts: number;
  staging_cap?: number;
  transmitted_sources: TransmittedSource[];
  rotation: RotationConcept[];
  lessons: Lesson[];
}

export interface ProviderDescriptor {
  provider_id: string;
  model_id: string;
  execution_origin: 'CLAUDE_CLI' | 'OPERATOR_FIXTURE' | 'CUSTOM';
  timeout_ms: number;
}

export interface ProviderResponse {
  raw: string;
  provider_id: string;
  model_id: string;
  execution_origin: ProviderDescriptor['execution_origin'];
}

export interface GenerationProvider {
  descriptor: ProviderDescriptor;
  generate(input: { prompt: string; request: GeneratorRequest }): Promise<ProviderResponse>;
}
