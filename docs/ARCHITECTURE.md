# Architecture and ownership

```text
ORIGINAL SENTRA
  owns evidence collection, rotation/lesson state, assignment and coordination
          |
          | versioned request: transmitted packets + rotation + lessons + limits
          v
STANDALONE CONCEPT GENERATOR
  owns prompt rendering, provider invocation, output contract, normalization,
  scientific gates, dedup, hashes, and the auditable generation result
          |
          | versioned result: raw response + contract + staged/dropped artifacts
          v
SENTRA
  owns semantic review, approval, factory execution, evaluation, and promotion
```

## Boundary

The repository is a deterministic core around one provider side effect:

```text
JSON request
  -> request/hash validation
  -> GROUNDED_SOURCE_PROMPT_V2
  -> GenerationProvider.generate(prompt)
  -> strict mechanism-invention-output-v1 validation
  -> packet-bound provenance enrichment
  -> economic/provenance/falsifier/dead-family/dedup gates
  -> versioned JSON result
```

The default provider invokes Claude Code in print mode, sends the prompt on
stdin, and retains the authoritative read-only `Read`, `Grep`, and `Glob` tool
grant. Provider identity and model identity are declared before execution and
verified against the returned provenance.

## Sentra owns

- corpus acquisition and extraction;
- production evidence, fuel, rotation, and lessons stores;
- assignments, leases, budgets, controller sessions, and resource governance;
- worker identities, enrollment keys, signatures, and remote coordination;
- raw-archive retention policy and authoritative controller ledgers;
- independent concept review, approvals, pre-registration, execution, holdout,
  verdicts, and promotion.

## This repository owns

- the versioned external request/result contracts;
- evidence-packet prompt construction and byte/hash accounting;
- the provider interface and Claude CLI adapter;
- strict provider-output and transmitted-packet validation;
- deterministic concept parsing, provenance binding, gates, normalization,
  source-class learning, and dedup;
- worker-compatible response hashes/claims;
- offline fixtures, tests, CLI/bootstrap, and safe configuration templates.

## Scaling model

Multiple machines can clone this repository, receive self-contained job JSON,
and return result JSON to a coordinating Sentra controller. Distribution,
leases, authentication, retries, and result arbitration remain controller
concerns and are deliberately not reimplemented here.

The request includes evidence packets instead of a database path. This makes
every scientific input explicit and prevents a nominally standalone clone from
silently depending on controller-owned mutable state.
