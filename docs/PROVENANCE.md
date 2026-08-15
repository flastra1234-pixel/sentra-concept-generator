# Source provenance and behavioral equivalence

## Extraction source

- Repository: `flastra1234-pixel/v1-trader-backtest-loop-version`
- Worktree at extraction: `C:\Users\flast\v1-trader-backtest-loop-version\.claude\worktrees\backtest-cmd`
- Branch: `integrate/backtest-cmd`
- Commit: `b9db654216aa5dea72b05fd8520a2c7bc041e6cf`
- Extraction date: 2026-08-15

This lineage is documentation, not a runtime dependency. The standalone Git
repository has fresh history.

## Module lineage

| Authoritative Sentra source | Standalone module | Treatment |
|---|---|---|
| `autonomy/mechanismEvidencePackets.ts` | `src/prompt.ts`, `src/output-contract.ts` | Prompt and evidence-index behavior copied; production evidence-store access excluded. |
| `autonomy/mechanismInventionOutput.ts` | `src/output-contract.ts` | Strict whole-response and packet contract copied. |
| `autonomy/mechanismInvent.ts` | `src/concept-pipeline.ts` | Parsing, gates, matchers, dedup, staging assembly copied. Store loaders/writers excluded. |
| `auto-loop/run-proposer.ts` | `src/concept-pipeline.ts` | Shared economic and ledger gate behavior copied, not the proposer service. |
| `autonomy/falsifierSpec.ts` | `src/falsifier-spec.ts` | Validator copied; controller registry imports replaced by extracted immutable resolvable-key sets. |
| `auto-loop/sourceClassScore.ts` | `src/source-class-score.ts` | Fact table and scoring behavior copied; standalone environment names added with legacy fallbacks. |
| `autonomy/dailyWorkerRuntime.ts` | `src/worker-contract.ts` | Deterministic claim parser and hashes copied. |
| `autonomy/continuousGenerationProvider.ts` + `autonomy/generationBackend.ts` + `autonomy/run-mechanism-invent.ts` | `src/provider.ts` | Claude CLI stdin/stdout semantics retained behind a clean provider interface. |
| `autonomy/continuousBroker.ts` | `src/generator.ts`, `src/types.ts`, `src/request.ts` | Generation/acceptance orchestration extracted; controller leases, stores, archives, and staging writes replaced by JSON contracts. |

## Direct equivalence proof

At extraction time, the controlled request and provider-response fixtures were
executed against both commit `b9db654…` and the standalone modules in the same
Node process. Exact object/string equality passed for:

- rendered prompt and prompt metadata;
- transmitted evidence index and strict output-contract result;
- worker-compatible claim and hashes;
- learned source weights;
- normalized/gated/deduped staging document.

The cross-repository comparison yielded these SHA-256 regression anchors:

| Deterministic artifact | SHA-256 |
|---|---|
| Prompt | `c53685c3e976d1ff6141090536556f764c60762ba02caccba8255b947bd36a30` |
| Output-contract result | `8defb2813c6f9717a4864b896951fa6bed36e7282260124f79b8c4074b4b35cf` |
| Worker claim | `851e3d08bd3f83b5fcfac49ab8c168fb9db6ac3e62d17dc3f806310e5fa7568a` |
| Staging document | `843b7849aeab0158215c2ceb5eedf2c29dfb5709e23ac44a513a3c1eeb36cf79` |

`tests/equivalence.test.ts` preserves these anchors without reaching into the
source Sentra checkout. Live model text is intentionally not asserted because
the provider is nondeterministic; all deterministic contracts around it are.

## Intentionally excluded state

No `.env`, API key, provider credential, worker key, enrollment token, broker
credential, cookie, session token, production fuel/corpus/evidence database,
raw archive, pending review, holdout, verdict, or mutable factory artifact was
copied. The committed fixture is synthetic.
