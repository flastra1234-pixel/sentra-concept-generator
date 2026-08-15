import type { SourceClass } from './types.ts';

export const SOURCE_CLASSES: readonly SourceClass[] = [
  'retail',
  'academic',
  'official',
];

export function classifyConceptSource(concept: {
  source_class?: unknown;
}): SourceClass {
  const raw =
    typeof concept.source_class === 'string'
      ? concept.source_class.trim().toLowerCase()
      : '';
  if (!raw) return 'retail';
  const first = raw.split(/[+\s,/]+/)[0];
  if (first === 'official') return 'official';
  if (first === 'academic') return 'academic';
  return 'retail';
}

export type FalsifierOutcome =
  | 'survived'
  | 'falsified'
  | 'parked'
  | 'blocked';
export const FALSIFIER_OUTCOME_BY_CONCEPT: Readonly<
  Record<string, FalsifierOutcome>
> = Object.freeze({
  entry_fx_fix_flow: 'falsified',
  ctx_opex_gamma_regime: 'falsified',
  entry_commodity_carry_panel: 'falsified',
  entry_vx_contango_carry: 'falsified',
  entry_macro_announcement_premium: 'falsified',
  entry_pension_rebalance_gap: 'parked',
  entry_rates_month_end_flow: 'survived',
  entry_absorption_divergence: 'blocked',
  entry_etf_flow_pressure: 'blocked',
});

export const PREREG_BY_CONCEPT: Readonly<Record<string, string>> =
  Object.freeze({
    entry_rates_month_end_flow: 'breadth-prereg-03',
    entry_80_rule_value_reentry: 'breadth-prereg-02 (Family A: mp-80)',
    entry_bollinger_band_reversion:
      'breadth-prereg-02 (Family B: bb-close)',
    entry_session_transition: 'breadth-prereg-02 (Family C: globex-eth)',
  });

export const SURVIVOR_CONCEPTS: readonly string[] = Object.freeze([
  'entry_rates_month_end_flow',
]);
export const RETAIL_GRINDER_BASELINE = Object.freeze({
  families: 11,
  coords: 2500,
  seats: 0,
  measured_at: '2026-08-02',
});

export interface ClassStats {
  source_class: SourceClass;
  proposed: number;
  ran_falsifier: number;
  survived_falsifier: number;
  reached_prereg: number;
  survivors: number;
  survivor_yield: number;
  weight: number;
}

export interface SourceClassScoreboard {
  by_class: Record<SourceClass, ClassStats>;
  retail_grinder: typeof RETAIL_GRINDER_BASELINE;
  totals: { proposed: number; survivors: number };
  measured_at_note: string;
}

const envNumber = (
  standalone: string,
  legacy: string,
  fallback: number,
): number => Number(process.env[standalone] ?? process.env[legacy] ?? fallback);
const PRIOR_SURVIVORS = envNumber(
  'SCG_SOURCE_PRIOR_SURVIVORS',
  'SENTRA_SRC_PRIOR_S',
  0.5,
);
const PRIOR_NONSURV = envNumber(
  'SCG_SOURCE_PRIOR_NONSURVIVORS',
  'SENTRA_SRC_PRIOR_F',
  3,
);
const W_SRC = envNumber(
  'SCG_SOURCE_WEIGHT',
  'SENTRA_PROPOSER_W_SRC',
  0.7,
);
const SRC_CAP_POS = envNumber(
  'SCG_SOURCE_CAP_POSITIVE',
  'SENTRA_SRC_CAP_POS',
  0.15,
);
const SRC_CAP_NEG = envNumber(
  'SCG_SOURCE_CAP_NEGATIVE',
  'SENTRA_SRC_CAP_NEG',
  -0.1,
);

export function sourceClassWeightFromCounts(
  survivors: number,
  proposed: number,
): number {
  const priorMean = PRIOR_SURVIVORS / (PRIOR_SURVIVORS + PRIOR_NONSURV);
  const shrunk =
    (survivors + PRIOR_SURVIVORS) /
    (proposed + PRIOR_SURVIVORS + PRIOR_NONSURV);
  const raw = W_SRC * (shrunk - priorMean);
  return Math.max(SRC_CAP_NEG, Math.min(SRC_CAP_POS, raw));
}

export function computeSourceClassScoreboard(
  concepts: ReadonlyArray<{ id: string; source_class?: unknown }>,
): SourceClassScoreboard {
  const blank = (): Omit<
    ClassStats,
    'source_class' | 'survivor_yield' | 'weight'
  > => ({
    proposed: 0,
    ran_falsifier: 0,
    survived_falsifier: 0,
    reached_prereg: 0,
    survivors: 0,
  });
  const acc = {
    retail: blank(),
    academic: blank(),
    official: blank(),
  };
  const survivorSet = new Set(SURVIVOR_CONCEPTS);
  for (const c of concepts) {
    const bucket = classifyConceptSource(c);
    const s = acc[bucket];
    s.proposed++;
    const outcome = FALSIFIER_OUTCOME_BY_CONCEPT[c.id];
    if (
      outcome === 'survived' ||
      outcome === 'falsified' ||
      outcome === 'parked'
    ) {
      s.ran_falsifier++;
    }
    if (outcome === 'survived') s.survived_falsifier++;
    if (c.id in PREREG_BY_CONCEPT) s.reached_prereg++;
    if (survivorSet.has(c.id)) s.survivors++;
  }
  const byClass = {} as Record<SourceClass, ClassStats>;
  let proposed = 0;
  let survivors = 0;
  for (const sourceClass of SOURCE_CLASSES) {
    const s = acc[sourceClass];
    proposed += s.proposed;
    survivors += s.survivors;
    byClass[sourceClass] = {
      source_class: sourceClass,
      ...s,
      survivor_yield: s.proposed > 0 ? s.survivors / s.proposed : 0,
      weight: sourceClassWeightFromCounts(s.survivors, s.proposed),
    };
  }
  return {
    by_class: byClass,
    retail_grinder: RETAIL_GRINDER_BASELINE,
    totals: { proposed, survivors },
    measured_at_note:
      'proposed counted live from the catalog; falsifier/prereg/survivor from the tracked fact table (each row cites a catalog _falsifier_result, ledger entry, or prereg doc); retail grinder aggregate is a documented baseline the catalog cannot see',
  };
}

const DRAW_FLOOR = envNumber(
  'SCG_DRAW_FLOOR',
  'SENTRA_INVENT_DRAW_FLOOR',
  0.2,
);

export function corpusDrawWeights(
  board: SourceClassScoreboard,
): Record<SourceClass, number> {
  const raw = {} as Record<SourceClass, number>;
  let sum = 0;
  for (const sourceClass of SOURCE_CLASSES) {
    const value = Math.max(
      0,
      DRAW_FLOOR + board.by_class[sourceClass].weight,
    );
    raw[sourceClass] = value;
    sum += value;
  }
  const out = {} as Record<SourceClass, number>;
  for (const sourceClass of SOURCE_CLASSES) {
    out[sourceClass] =
      sum > 0 ? raw[sourceClass] / sum : 1 / SOURCE_CLASSES.length;
  }
  return out;
}

export function learnWeights(
  rotation: ReadonlyArray<{ id: string; source_class?: unknown }>,
): {
  board: SourceClassScoreboard;
  draw: Record<SourceClass, number>;
} {
  const board = computeSourceClassScoreboard(rotation);
  return { board, draw: corpusDrawWeights(board) };
}
