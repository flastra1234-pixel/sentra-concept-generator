import { validateFalsifierSpec } from './falsifier-spec.ts';
import type { SourceClassScoreboard } from './source-class-score.ts';
import type {
  Lesson,
  RotationConcept,
  SourceClass,
} from './types.ts';

export interface InventedConcept {
  id: string;
  slot: string;
  family?: string;
  concept: string;
  economic_counterparty: string;
  persistence_reason: string;
  cheapest_falsifier: string;
  falsifier_spec?: Record<string, unknown>;
  transmission_channel: string;
  session_window?: string;
  provenance: string[];
  source_class?: string;
  shelf?: string;
  expected_trades_per_month?: number;
  gate_phrase_suggestion?: string[];
  data_blocked?: string;
  _dedup_top?: string | null;
  evidence_refs?: unknown[];
  mechanism_atoms?: unknown[];
  evidence_link_class?: 'MODEL_PROPOSED_PACKET_LINK';
  concept_evidence_label?:
    | 'ABSTRACT_SUPPORTED_HYPOTHESIS'
    | 'EVIDENCE_BOUND_PROPOSAL';
  semantic_review_required?: boolean;
}

export type DropCause =
  | { gate: 'ledger'; against: string; kind: string; cause: string }
  | { gate: 'econ'; field: string; reason: string }
  | { gate: 'provenance'; field: 'provenance'; reason: string }
  | { gate: 'falsifier_spec'; field: string; reason: string }
  | { gate: 'dedup'; against: string; shared: string[]; note: string };

export interface FilterVerdict {
  staged: boolean;
  drop: DropCause | null;
  dedup_top: string | null;
}

export interface DrawSummary {
  source_class: SourceClass;
  weight: number;
  available: number;
  selected: number;
}

export interface StagingDoc {
  _comment: string;
  _pipeline: string;
  _fences: string;
  generated_at: string;
  since: string;
  learned_weights: {
    scoreboard: SourceClassScoreboard;
    corpus_draw: Record<SourceClass, number>;
    draw_summary: DrawSummary[];
  };
  survivors: InventedConcept[];
  dropped: Array<{ id: string; drop: DropCause }>;
  overflow: number;
}

export function parseInventedConcepts(raw: string): InventedConcept[] {
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
  const out: InventedConcept[] = [];
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const slot = typeof o.slot === 'string' ? o.slot.trim() : '';
    const concept = typeof o.concept === 'string' ? o.concept.trim() : '';
    if (!id || !slot || !concept) continue;
    out.push({
      id,
      slot,
      concept,
      family: typeof o.family === 'string' ? o.family : undefined,
      economic_counterparty:
        typeof o.economic_counterparty === 'string'
          ? o.economic_counterparty
          : '',
      persistence_reason:
        typeof o.persistence_reason === 'string' ? o.persistence_reason : '',
      cheapest_falsifier:
        typeof o.cheapest_falsifier === 'string' ? o.cheapest_falsifier : '',
      falsifier_spec:
        o.falsifier_spec &&
        typeof o.falsifier_spec === 'object' &&
        !Array.isArray(o.falsifier_spec)
          ? (o.falsifier_spec as Record<string, unknown>)
          : undefined,
      transmission_channel:
        typeof o.transmission_channel === 'string'
          ? o.transmission_channel
          : '',
      session_window:
        typeof o.session_window === 'string' && o.session_window.trim()
          ? o.session_window.trim()
          : undefined,
      provenance: Array.isArray(o.provenance)
        ? o.provenance.filter((p): p is string => typeof p === 'string')
        : [],
      source_class:
        typeof o.source_class === 'string' ? o.source_class : undefined,
      shelf: typeof o.shelf === 'string' ? o.shelf : undefined,
      expected_trades_per_month:
        typeof o.expected_trades_per_month === 'number'
          ? o.expected_trades_per_month
          : undefined,
      gate_phrase_suggestion: Array.isArray(o.gate_phrase_suggestion)
        ? o.gate_phrase_suggestion.filter(
            (p): p is string => typeof p === 'string',
          )
        : undefined,
      data_blocked:
        typeof o.data_blocked === 'string' && o.data_blocked.trim()
          ? o.data_blocked.trim()
          : undefined,
    });
  }
  return out;
}

export const ECON_FIELDS = [
  'economic_counterparty',
  'persistence_reason',
  'cheapest_falsifier',
  'transmission_channel',
] as const;
const ECON_MIN_CHARS = 30;
const ECON_HANDWAVE: ReadonlyArray<RegExp> = [
  /market(s)?\s+(is|are|remain(s)?)\s+inefficien/i,
  /\binefficienc(y|ies)\b/i,
  /(traders?|investors?|participants?|people)\s+(often\s+|tend\s+to\s+|systematically\s+)?(overreact|under-?react|misprice|are\s+irrational|behave\s+irrationally)/i,
  /behaviou?ral\s+(bias|effect|anomal)/i,
  /slow\s+to\s+(incorporate|price|react|adjust|update)/i,
  /anomal(y|ies)\s+(persists?|continues?|remains?)/i,
  /(nobody|no\s?one)\s+(has\s+)?(noticed|noticed\s+it|knows|is\s+looking)/i,
  /not\s+widely\s+known|under-?explored|overlooked|little[-\s]known/i,
];
const ECON_COMPETED_AWAY =
  /(would|will|likely\s+to)\s+(quickly\s+|eventually\s+|soon\s+)?(be\s+)?(competed|arbitraged|traded)\s+away/i;
const ECON_COMPETED_NEGATED =
  /(not|never|cannot|can't|won't|hard\s+to\s+be|difficult\s+to\s+be)\s+(quickly\s+|eventually\s+|easily\s+|fully\s+)?(be\s+)?(competed|arbitraged|traded)\s+away/i;

export function econJustificationCheck(
  spec: Record<string, unknown>,
): { field: string; reason: string } | null {
  for (const field of ECON_FIELDS) {
    if (field === 'transmission_channel' && !(field in spec)) continue;
    const value = spec[field];
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length === 0) {
      return {
        field,
        reason:
          'missing/empty — the requirement is stated in the generation prompt',
      };
    }
    if (text.length < ECON_MIN_CHARS) {
      return {
        field,
        reason: `too short to name anything concrete ("${text}")`,
      };
    }
    if (field !== 'cheapest_falsifier') {
      for (const rx of ECON_HANDWAVE) {
        const match = rx.exec(text);
        if (match) {
          return {
            field,
            reason: `hand-waving, not a mechanism ("${match[0]}") — name the counterparty and the obligation`,
          };
        }
      }
    }
    if (
      field === 'persistence_reason' &&
      ECON_COMPETED_AWAY.test(text) &&
      !ECON_COMPETED_NEGATED.test(text)
    ) {
      const match = ECON_COMPETED_AWAY.exec(text);
      return {
        field,
        reason: `the honest answer is "${match![0]}" — a mechanism that only works while secret is not a mechanism`,
      };
    }
  }
  return null;
}

const DEAD_KINDS = new Set([
  'falsified',
  'mined-out',
  'falsified-as-alpha',
  'closed-class',
]);
const isDeadLesson = (lesson: Lesson): boolean =>
  DEAD_KINDS.has(lesson.kind);
const causeOfDeath = (lesson: Lesson): string =>
  lesson.cause_of_death ?? lesson.steering.text;

const CONSTRAINT_MATCHERS: Record<string, RegExp> = {
  'tight-stop-mnq-closed-class': /tight.?stop|scalp|micro.?stop/i,
  'auction-fade-cost-geometry':
    /\b(dva|value.?area|frvp|val.?vah|vwap|extreme|developing.?va)\b.{0,25}fade|fade\b.{0,20}(entry|extreme|rotation|va)/i,
  'equity-seasonal-ticker-spray':
    /(turn.?of.?month|calendar.?season|month.?bias|seasonal(it)?y?)\b.{0,30}(equity|etf|stock)|(equity|etf|stock).{0,30}(turn.?of.?month|calendar.?season|month.?bias)/i,
  'long-only-daily-clears-on-beta':
    /(mean.?rever(?:sion|t)?|meanrev).{0,40}(equity|etf|stock|spy|qqq|dia|iwm|eem)|(equity|etf|stock).{0,30}(mean.?rever|meanrev)|long.?only.{0,20}daily.{0,20}(equity|etf)/i,
  'vwap-reversion-band-fade-falsified':
    /vwap.{0,25}(rever|fade|band)|(bollinger|envelope|keltner|band).{0,25}(rever|fade|extension)|\bbb[-_ ]?rever|(rever|fade)\w*.{0,25}(bollinger|band\b)|close.?back.?inside/i,
  'gap-continuation-falsified':
    /\bgap\b.{0,30}(continuation|follow|momentum|drift|own.{0,10}direction)|(continuation|follow(?:ing)?|momentum).{0,25}\bgap\b/i,
  'pre-settlement-drift-falsified':
    /pre.?settlement|settlement.{0,20}(drift|window|positioning|approach)|into.{0,12}settlement/i,
  'cot-positioning-fade-falsified':
    /\bcot\b.{0,40}(position|extreme|fade)|commitments?.?of.?traders.{0,40}(position|extreme|fade)|managed.?money.{0,25}(net|extreme|fade)/i,
  'cot-flow-fade-falsified':
    /\bcot\b.{0,40}(flow|change|delta|week)|commitments?.?of.?traders.{0,40}(flow|change|delta)/i,
  'mp-80pct-value-reentry-falsified':
    /80.?(%|pct|percent).{0,25}(rule|value|re.?entry)|value.?re.?entry|far.?edge.{0,25}(traverse|target)|value.?area.{0,20}acceptance/i,
  'fx-fix-fade-falsified':
    /fx[\s_-]?fix|wm\/?r(euters)?\b|london.{0,8}fix\b|\b4\s?-?pm.{0,8}fix\b|benchmark.{0,8}fix(ing)?\b|fix(ing)?[\s_-](window|rate|benchmark|flow)\b|\b(pre|post)[\s_-]fix\b/i,
  'commodity-carry-panel-falsified':
    /commodity.{0,12}carry|carry[\s_-]?panel|hedging[\s_-]?pressure.{0,30}carry|cross[\s_-]?section\w*.{0,30}carry|carry.{0,30}cross[\s_-]?section|(backwardat|contango)\w*.{0,45}(panel|pooled|cross[\s_-]?section|roots|universe)|(panel|pooled).{0,35}(backwardat|contango)/i,
  'vx-contango-carry-falsified':
    /vx[\s_-]?contango|contango[\s_-]?carry|(vix|vx)[\s_-]?futures?.{0,45}(carry|roll[\s_-]?down|contango|slope)|(short|sell|fade)\w*.{0,25}(vix|vx)\b.{0,30}(futures?|front|roll|contango)|roll[\s_-]?down.{0,30}(vix|vx)\b|contango.{0,30}(vix|vx)\b/i,
  'macro-announcement-premium-falsified':
    /macro[\s_-]?announcement|announcement[\s_-]?(risk[\s_-]?)?premium|premium.{0,35}(announcement|release)\b|(fomc|nfp|payrolls?|cpi)\w*.{0,40}(risk[\s_-]?premium|premium)|(announcement|release)[\s_-]?window.{0,35}(premium|concentrat|return)/i,
  'opex-gamma-regime-falsified':
    /opex[\s_-]?gamma|gamma[\s_-]?regime|\bopex\b|dealer[\s_-]?gamma.{0,35}(cycle|regime|calendar|expir|week|pin)|gamma[\s_-]?(cycle|calendar)|expiration[\s_-]?week.{0,40}(regime|range|vol|trend|dampen|compress)/i,
  'aggressor-signed-flow-falsified':
    /aggress(or|ion)|metaorder|absorption[\s_-]?diverg|absorption.{0,30}(?:flow|imbalance)|signed[\s_-]?(?:trade|order|volume|aggressor)?s?[\s_-]?flow|order[\s_-]?flow.{0,30}(?:continuat|persist|decay|diverg)|cum(?:ulative)?[\s_-]?delta/i,
};

export function ledgerRejectCheck(
  text: string,
  entries: Lesson[],
): { id: string; kind: string; cause: string } | null {
  for (const lesson of entries) {
    if (
      !isDeadLesson(lesson) &&
      lesson.steering?.mode !== 'constraint'
    ) {
      continue;
    }
    const matcher = CONSTRAINT_MATCHERS[lesson.id];
    if (matcher && matcher.test(text)) {
      return {
        id: lesson.id,
        kind: lesson.kind,
        cause: causeOfDeath(lesson),
      };
    }
  }
  return null;
}

const LEDGER_TALK =
  /\bledger\b|falsified|cause.?of.?death|dead[\s-](?:famil|kin|class)|closed.{0,24}class|\bdistinction\b|\brul(?:ed|ing)\b|\bkilled\b|\bdied\b/i;

export function stripLedgerMentions(
  mechanic: string,
  entries: readonly Lesson[],
): { text: string; dropped: number } {
  const ids = entries
    .flatMap((l) => [l.id, l.id.replace(/-falsified$/, '')])
    .filter((s) => s.includes('-'))
    .map((s) => s.toLowerCase());
  const segments = String(mechanic).split(/(?<=[.!?])\s+(?=[A-Z(])/);
  const kept = segments.filter((segment) => {
    if (LEDGER_TALK.test(segment)) return false;
    const low = segment.toLowerCase();
    return !ids.some((id) => low.includes(id));
  });
  return {
    text: kept.join(' '),
    dropped: segments.length - kept.length,
  };
}

export function mechanismText(c: InventedConcept): string {
  return `${c.id} ${c.family ?? ''} ${c.concept}`;
}

const GENERIC_TOKENS = new Set([
  'entry',
  'exit',
  'stop',
  'target',
  'slot',
  'concept',
  'mechanism',
  'mechanic',
  'trade',
  'trades',
  'signal',
  'price',
  'prices',
  'return',
  'returns',
  'market',
  'markets',
  'data',
  'owned',
  'daily',
  'minute',
  'test',
  'falsifier',
  'when',
  'then',
  'that',
  'this',
  'with',
  'from',
  'into',
  'over',
  'the',
  'and',
  'for',
  'not',
  'next',
  'week',
  'day',
  'session',
  'bar',
  'bars',
  'long',
  'short',
  'buy',
  'sell',
  'fade',
  'edge',
  'flow',
]);

function distinctiveTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length < 4 || GENERIC_TOKENS.has(word)) continue;
    out.add(word);
  }
  return out;
}

const DEDUP_MIN_SHARED = Number(
  process.env.SCG_DEDUP_MIN_SHARED ??
    process.env.SENTRA_INVENT_DEDUP_MIN_SHARED ??
    4,
);
const DEDUP_MIN_FRACTION = Number(
  process.env.SCG_DEDUP_FRACTION ??
    process.env.SENTRA_INVENT_DEDUP_FRACTION ??
    0.4,
);

export function dedupCause(
  c: InventedConcept,
  rotation: ReadonlyArray<{ id: string; concept?: string }>,
  lessons: readonly Lesson[],
): { drop: DropCause | null; top: string | null } {
  const candidate = distinctiveTokens(`${c.id} ${c.concept}`);
  if (candidate.size === 0) return { drop: null, top: null };
  const against = [
    ...rotation.map((r) => ({
      name: r.id,
      tokens: distinctiveTokens(`${r.id} ${r.concept ?? ''}`),
    })),
    ...lessons.map((l) => ({
      name: l.id,
      tokens: distinctiveTokens(`${l.id} ${l.mechanism}`),
    })),
  ];
  let best: { name: string; shared: string[] } | null = null;
  for (const item of against) {
    const shared = [...candidate].filter((token) =>
      item.tokens.has(token),
    );
    if (!best || shared.length > best.shared.length) {
      best = { name: item.name, shared };
    }
  }
  if (!best || best.shared.length === 0) {
    return { drop: null, top: null };
  }
  const top = `${best.name} (${best.shared.length} shared)`;
  if (
    best.shared.length >= DEDUP_MIN_SHARED &&
    best.shared.length / candidate.size >= DEDUP_MIN_FRACTION
  ) {
    return {
      drop: {
        gate: 'dedup',
        against: best.name,
        shared: best.shared,
        note: `near-restatement of ${best.name} (${best.shared.length}/${candidate.size} distinctive tokens shared)`,
      },
      top,
    };
  }
  return { drop: null, top };
}

const normalizeTitle = (s: string): string =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const PROV_MATCH_MIN_CHARS = 10;

export function provenanceCause(
  c: InventedConcept,
  seededTitles?: readonly string[],
): DropCause | null {
  const provenance = (c.provenance ?? [])
    .map((p) => String(p).trim())
    .filter(Boolean);
  if (provenance.length === 0) {
    return {
      gate: 'provenance',
      field: 'provenance',
      reason:
        'empty — a concept must cite the seeded paper(s) it came from (the approval gate refuses provenance-less output, so staging does too)',
    };
  }
  if (seededTitles && seededTitles.length > 0) {
    const seeds = seededTitles.map(normalizeTitle).filter(Boolean);
    for (const cited of provenance) {
      const normalized = normalizeTitle(cited);
      const matches = seeds.some((seed) => {
        const shorter = Math.min(seed.length, normalized.length);
        return (
          shorter >= PROV_MATCH_MIN_CHARS &&
          (seed.includes(normalized) || normalized.includes(seed))
        );
      });
      if (!matches) {
        return {
          gate: 'provenance',
          field: 'provenance',
          reason: `hallucinated citation — "${cited}" is not in this run's seed set (${seededTitles.length} seeded title(s)); a concept that cannot be traced to a seeded paper must not be proposed`,
        };
      }
    }
  }
  return null;
}

export function filterConcept(
  c: InventedConcept,
  lessons: readonly Lesson[],
  rotation: ReadonlyArray<{ id: string; concept?: string }>,
  seededTitles?: readonly string[],
): FilterVerdict {
  const stripped = stripLedgerMentions(mechanismText(c), lessons).text;
  const ledger = ledgerRejectCheck(stripped, [...lessons]);
  if (ledger) {
    return {
      staged: false,
      drop: {
        gate: 'ledger',
        against: ledger.id,
        kind: ledger.kind,
        cause: ledger.cause,
      },
      dedup_top: null,
    };
  }
  const econ = econJustificationCheck(
    c as unknown as Record<string, unknown>,
  );
  if (econ) {
    return {
      staged: false,
      drop: { gate: 'econ', field: econ.field, reason: econ.reason },
      dedup_top: null,
    };
  }
  const provenance = provenanceCause(c, seededTitles);
  if (provenance) {
    return { staged: false, drop: provenance, dedup_top: null };
  }
  if (c.falsifier_spec === undefined) {
    return {
      staged: false,
      drop: {
        gate: 'falsifier_spec',
        field: 'falsifier_spec',
        reason:
          'missing — the machine-readable spec is required alongside the prose cheapest_falsifier (11/61 legacy falsifier texts were runnable; the spec is how a concept arrives testable)',
      },
      dedup_top: null,
    };
  }
  const spec = validateFalsifierSpec(c.falsifier_spec);
  if (spec) {
    return {
      staged: false,
      drop: {
        gate: 'falsifier_spec',
        field: spec.field,
        reason: spec.reason,
      },
      dedup_top: null,
    };
  }
  const { drop, top } = dedupCause(c, rotation, lessons);
  if (drop) return { staged: false, drop, dedup_top: top };
  return { staged: true, drop: null, dedup_top: top };
}

export const STAGED_CAP_DEFAULT = 20;

export function capStaged<T>(
  staged: readonly T[],
  max = STAGED_CAP_DEFAULT,
): { kept: T[]; overflow: number } {
  return {
    kept: staged.slice(0, max),
    overflow: Math.max(0, staged.length - max),
  };
}

export function assembleStagingDoc(input: {
  survivors: InventedConcept[];
  dropped: Array<{ id: string; drop: DropCause }>;
  overflow: number;
  board: SourceClassScoreboard;
  draw: Record<SourceClass, number>;
  drawSummary: DrawSummary[];
  generatedAt: string;
  since: string;
  scanned: number;
}): StagingDoc {
  return {
    _comment:
      'STAGING ONLY — operator review required. NEW mechanism concepts invented from the fresh ' +
      'corpus by the standing corpus->mechanism loop. NOTHING here enters auto-loop/proposer-concepts.json ' +
      'without explicit operator approval. Every survivor passed BOTH live gates programmatically (the real ' +
      'ledgerRejectCheck against the live lessons ledger, and the real econJustificationCheck on the three ' +
      'answers) and was deduped against the rotation + the dead-family ledger.',
    _pipeline:
      `${input.scanned} fresh corpus records since ${input.since} -> mechanism-vocabulary bar + ` +
      `source-class-weighted draw -> backend invention -> ledger + three-question + dedup gates -> ` +
      `${input.survivors.length} staged, ${input.dropped.length} dropped.`,
    _fences:
      'Autonomy at the CONCEPT stage only: proposed hypotheses, staged for review. No parameter ' +
      'variants, no rotation write, no enrollment, no pre-registration — those stay operator-gated.',
    generated_at: input.generatedAt,
    since: input.since,
    learned_weights: {
      scoreboard: input.board,
      corpus_draw: input.draw,
      draw_summary: input.drawSummary,
    },
    survivors: input.survivors,
    dropped: input.dropped,
    overflow: input.overflow,
  };
}

export function stageInventedConcepts(input: {
  concepts: readonly InventedConcept[];
  lessons: readonly Lesson[];
  rotation: RotationConcept[];
  board: SourceClassScoreboard;
  draw: Record<SourceClass, number>;
  generatedAt: string;
  since: string;
  scanned: number;
  cap?: number;
  seededTitles?: readonly string[];
  drawSummary: DrawSummary[];
}): StagingDoc {
  const survivors: InventedConcept[] = [];
  const dropped: Array<{ id: string; drop: DropCause }> = [];
  for (const concept of input.concepts) {
    const verdict = filterConcept(
      concept,
      input.lessons,
      input.rotation,
      input.seededTitles,
    );
    if (verdict.staged) {
      survivors.push({ ...concept, _dedup_top: verdict.dedup_top });
    } else if (verdict.drop) {
      dropped.push({ id: concept.id, drop: verdict.drop });
    }
  }
  const { kept, overflow } = capStaged(
    survivors,
    input.cap ?? STAGED_CAP_DEFAULT,
  );
  return assembleStagingDoc({
    survivors: kept,
    dropped,
    overflow,
    board: input.board,
    draw: input.draw,
    drawSummary: input.drawSummary,
    generatedAt: input.generatedAt,
    since: input.since,
    scanned: input.scanned,
  });
}
