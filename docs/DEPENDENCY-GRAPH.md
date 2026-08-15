# Extraction dependency graph

This graph was recorded before source extraction. It reflects the live Sentra
deployment inspected on 2026-08-15, not an older documentation pointer.

## Authority evidence

- Source worktree: `C:\Users\flast\v1-trader-backtest-loop-version\.claude\worktrees\backtest-cmd`
- Branch: `integrate/backtest-cmd`
- Commit: `b9db654216aa5dea72b05fd8520a2c7bc041e6cf`
- Remote: `https://github.com/flastra1234-pixel/v1-trader-backtest-loop-version`
- Live controller, worker API, continuous-research, and scheduled proposer tasks all target this worktree.
- The tracked worktree was clean at inspection time; its status contained untracked operational and research artifacts only.
- `SentraMechanismInvent` is deliberately disabled. A recorded operator ruling says continuous concept generation replaced that legacy schedule.

The older generator at `C:\Users\flast\sentra\trading\grounding` remains a real,
historical grounded proposer and is still consumed by the legacy scheduled
proposer. It is not the authoritative continuous Concept Generator extracted
here.

## Current runtime graph

```text
Sentra controller / worker API
  run-worker-api-server.ts
    |
    +--> controller stores, assignment, lease, worker identity, fuel budget
    |
    +--> brokerContinuousGeneration()             [continuousBroker.ts]
           |
           +--> materialize CALL_READY fuel       [continuousFuel.ts]
           +--> renderGroundedPrompt()             [mechanismEvidencePackets.ts]
           +--> GenerationProvider interface       [continuousBroker.ts]
           |      `--> currentCliGenerationProvider()
           |             `--> inventViaBackend()   [run-mechanism-invent.ts]
           |                    `--> read-only Claude CLI over stdin/stdout
           +--> backend-call ledger + raw archive  [controller-owned state]
           `--> raw response returned to worker

Worker package v3/v4
  dailyWorkerRuntime.ts
    `--> weak, deterministic claim inspection + canonical hashes
           `--> signed result returned to controller

Sentra controller acceptance
  acceptContinuousGeneration()                    [continuousBroker.ts]
    |
    +--> buildTransmittedEvidenceIndex()
    +--> parseAndValidateInventionOutput()         [mechanismInventionOutput.ts]
    +--> parseInventedConcepts()                   [mechanismInvent.ts]
    +--> ledger/economic/provenance/falsifier gates
    +--> distinctive-token dedup + source-class learning
    `--> controller-owned staging artifact / later independent concept review
```

## Extraction decisions

| Class | Dependency | Decision |
|---|---|---|
| A — generator behavior | Grounded prompt V2 and exact evidence-packet vocabulary | Copy into the standalone core. |
| A — generator behavior | Strict `mechanism-invention-output-v1` parser and packet validator | Copy into the standalone core. |
| A — generator behavior | Concept normalization, economic/provenance/falsifier gates, dead-family ledger matchers, source-class weights, and dedup | Copy into the standalone core. |
| A — generator behavior | Worker-side canonical hashing and envelope claim inspection | Copy as a compatibility module. |
| A — generator behavior | Claude CLI stdin/stdout invocation semantics and read-only tool grant | Copy into the default provider adapter. |
| B — clean interface | `GenerationProvider` | Replace the controller-bound type with a small standalone interface. |
| B — clean interface | Fuel packet, rotation, and lessons stores | Replace with a versioned JSON request on stdin or from a job file. |
| B — clean interface | Raw-response archive and staging writes | Return an auditable JSON result; optional output-file persistence belongs to the CLI. |
| C — configuration | Model, CLI path, timeout, prompt/dedup/source-score knobs | Environment variables with safe documented defaults. |
| D — reusable module | Prompt rendering, output validation, gating, and provider API | Export as library modules in this repository. |
| E — controller-owned | Assignment/lease/worker identity, budgets, session arbitration, resource governor, controller store, fuel queue | Exclude. Sentra keeps these responsibilities. |
| E — research-factory-owned | Corpus manifests, production evidence stores, proposal review, approvals, factory execution, holdout, verdict store | Exclude. Inputs cross the JSON boundary instead. |
| E — worker deployment | Enrollment keys, signatures, remote worker protocol client, packaged worker services | Exclude. No worker secrets or identity state are copied. |

## Standalone boundary

```text
Sentra or another caller
  -- versioned JSON request: transmitted evidence + rotation + lessons + limits
          |
          v
sentra-concept-generator
  -- exact prompt -> provider -> strict validation -> normalization/gates/dedup
          |
          v
versioned JSON result: provenance + hashes + valid/staged/dropped concepts
```

The boundary intentionally carries evidence packets rather than a production
research database. This keeps scientific inputs explicit and lets another
machine run the generator without any Sentra checkout or mutable Sentra store.
