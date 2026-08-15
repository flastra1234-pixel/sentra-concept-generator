export const SIGNAL_KINDS = ['window_return', 'trailing_return', 'forward_return', 'rolling_beta_residual', 'range_volume_metric'] as const;
export const CONDITION_KINDS = ['none', 'percentile', 'zscore', 'calendar'] as const;
export const STATISTICS = ['mean_diff_vs_unconditional', 'ols_beta', 'corr_and_fade_mean'] as const;
export const EFFECT_UNITS = ['bp', 'pts'] as const;
export const LB_RULES = ['gt0', 'lt0'] as const;
export const BAR_DIRECTIONS = ['positive', 'negative', 'reversion'] as const;
export const CORRECTED_SE_METHODS = ['cluster_by_date', 'block_bootstrap_dates'] as const;

// Copied from the authoritative registries at extraction commit b9db654. The
// generator only needs their resolvable keys; execution engines stay in Sentra.
export const INTRADAY_INSTRUMENTS = new Set([
  '6e', '6j', 'es', 'gc', 'hg', 'm2k', 'mcl', 'mes', 'mgc', 'mnq', 'mym',
  'ng', 'nq', 'si', 'zb', 'zc', 'zn', 'zs',
]);
export const DAILY_INSTRUMENTS = new Set([
  '6e', '6j', 'audusd', 'dia-us', 'eem-us', 'efa-us', 'eurusd', 'ewg-us',
  'ewh-us', 'ewj-us', 'ewq-us', 'ewu-us', 'gbpusd', 'gc', 'gld-us', 'hg',
  'hyg-us', 'ief-us', 'iwm-us', 'm2k', 'mcl', 'mes', 'mym', 'ng', 'qqq-us',
  'si', 'slv-us', 'spy-us', 'tlt-us', 'usdcad', 'usdjpy', 'uso-us', 'xle-us',
  'xlf-us', 'zb', 'zc', 'zn', 'zs',
]);

type Bad = { field: string; reason: string };
const bad = (field: string, reason: string): Bad => ({ field, reason });
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function resolvableKeys(surface: string): Set<string> {
  if (surface === '1m') return new Set(INTRADAY_INSTRUMENTS);
  return new Set([...DAILY_INSTRUMENTS, 'etf-set']);
}

/** Exact shape/resolvability gate from Sentra's authoritative generator. */
export function validateFalsifierSpec(spec: unknown): Bad | null {
  if (!isObj(spec)) return bad('falsifier_spec', 'missing or not an object — the machine-readable spec is required alongside the prose falsifier');
  if (!isObj(spec.dataset)) return bad('dataset', 'missing');
  const surface = spec.dataset.surface;
  if (surface !== '1m' && surface !== 'daily') return bad('dataset.surface', `must be '1m' | 'daily' (got ${JSON.stringify(surface)})`);
  const instruments = spec.dataset.instruments;
  if (!Array.isArray(instruments) || instruments.length === 0 || !instruments.every((i) => typeof i === 'string')) {
    return bad('dataset.instruments', 'must be a non-empty string array');
  }
  const keys = resolvableKeys(surface);
  for (const i of instruments as string[]) {
    if (!keys.has(i)) return bad('dataset.instruments', `'${i}' does not resolve in the ${surface} registry — a spec naming data the harness cannot load is useless`);
  }
  if (!isObj(spec.signal) || !(SIGNAL_KINDS as readonly string[]).includes(String(spec.signal.kind))) return bad('signal.kind', `must be one of ${SIGNAL_KINDS.join(' | ')}`);
  if (!isObj(spec.signal.params)) return bad('signal.params', 'missing (an empty object is fine; absence is not)');
  if (!isObj(spec.condition) || !(CONDITION_KINDS as readonly string[]).includes(String(spec.condition.kind))) return bad('condition.kind', `must be one of ${CONDITION_KINDS.join(' | ')}`);
  if (!isObj(spec.response) || !(SIGNAL_KINDS as readonly string[]).includes(String(spec.response.kind))) return bad('response.kind', `must be one of ${SIGNAL_KINDS.join(' | ')}`);
  if (!isObj(spec.response.params)) return bad('response.params', 'missing');
  if (!(STATISTICS as readonly string[]).includes(String(spec.statistic))) return bad('statistic', `must be one of ${STATISTICS.join(' | ')}`);
  if (!isObj(spec.pooling)) return bad('pooling', 'MANDATORY with no default — declare single vs pooled and name the series; an undeclared pool is how a 19-correlated-ETF t-stat passes naive inference');
  const pooling = spec.pooling;
  if (pooling.mode !== 'single' && pooling.mode !== 'pooled') return bad('pooling.mode', "must be 'single' | 'pooled'");
  if (!Array.isArray(pooling.series) || pooling.series.length === 0 || !pooling.series.every((s) => typeof s === 'string')) return bad('pooling.series', 'must name the series (non-empty string array)');
  if (pooling.mode === 'pooled') {
    if (!isObj(pooling.corrected)) return bad('pooling.corrected', 'REQUIRED for a pooled spec: the correlation-aware bar (corrected-SE method, corrected t_min, min_effective_n, per_series_breakdown) — naive-passes/corrected-fails is DEAD, not a caveat');
    const c = pooling.corrected;
    if (!(CORRECTED_SE_METHODS as readonly string[]).includes(String(c.method))) return bad('pooling.corrected.method', `must be one of ${CORRECTED_SE_METHODS.join(' | ')}`);
    if (!finite(c.t_min) || c.t_min <= 0) return bad('pooling.corrected.t_min', 'a positive threshold against the CORRECTED statistic is required');
    if (!finite(c.min_effective_n) || c.min_effective_n < 1) return bad('pooling.corrected.min_effective_n', 'the effective-sample floor (correlation-adjusted, not the raw count) is required');
    if (c.per_series_breakdown !== true) return bad('pooling.corrected.per_series_breakdown', 'must be true — a pooled effect carried by 2 of 19 series is a different finding from one present in 15');
  } else if (pooling.corrected !== undefined) {
    return bad('pooling.corrected', "only valid when mode is 'pooled'");
  }
  if (!isObj(spec.bar)) return bad('bar', 'missing — the pass/fail bar must be fixed in the spec, not invented at grading time');
  const b = spec.bar;
  if (!(BAR_DIRECTIONS as readonly string[]).includes(String(b.direction))) return bad('bar.direction', `must be one of ${BAR_DIRECTIONS.join(' | ')}`);
  if (!finite(b.t_min) || b.t_min <= 0) return bad('bar.t_min', 'a positive t threshold is required');
  if (!finite(b.min_effect)) return bad('bar.min_effect', 'a finite minimum effect size is required (0 is allowed, absence is not)');
  if (!(EFFECT_UNITS as readonly string[]).includes(String(b.effect_unit))) return bad('bar.effect_unit', `must be one of ${EFFECT_UNITS.join(' | ')}`);
  if (!(LB_RULES as readonly string[]).includes(String(b.lb_rule))) return bad('bar.lb_rule', `must be one of ${LB_RULES.join(' | ')}`);
  if (!finite(spec.min_n) || spec.min_n < 1) return bad('min_n', 'the minimum usable sample (below = INCONCLUSIVE) is required');
  if (!isObj(spec.orthogonalisation)) return bad('orthogonalisation', 'missing — the re-labelled-price trap is part of every grading');
  const o = spec.orthogonalisation;
  if (!Array.isArray(o.controls) || o.controls.length === 0 || !o.controls.every((x) => typeof x === 'string')) return bad('orthogonalisation.controls', 'must name the trailing-path controls');
  if (!finite(o.kill_t_min) || o.kill_t_min <= 0) return bad('orthogonalisation.kill_t_min', 'a positive kill threshold is required');
  return null;
}
