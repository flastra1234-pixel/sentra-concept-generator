# Sentra Concept Generator

Standalone, evidence-grounded concept generation extracted from Sentra's live
continuous-generation path. This repository does not need a Sentra checkout,
controller store, research database, worker enrollment, or production state.

The generator accepts a versioned JSON request, renders the authoritative
`GROUNDED_SOURCE_PROMPT_V2`, calls a provider, validates the exact
`mechanism-invention-output-v1` contract, and applies Sentra's deterministic
normalization, economic, provenance, falsifier, dead-family, and dedup gates.
Its versioned JSON result includes the raw provider response, hashes, contract
diagnostics, worker-compatible claim, survivors, and downstream rejections.

## Requirements

- Node.js 24 or newer
- No npm runtime dependencies
- For live generation: an installed and authenticated Claude Code CLI, or a
  custom provider implemented against `GenerationProvider`

The repository contains no provider credentials. The default provider reuses
the operator's existing Claude Code CLI authentication and passes the prompt on
stdin. A missing executable, missing authentication, timeout, nonzero exit, or
empty response fails closed without producing a staging artifact.

## Install and verify

```powershell
git clone <repository-url> sentra-concept-generator
cd sentra-concept-generator
npm ci
npm test
npm run smoke
npm run doctor
```

`npm run smoke` is offline and deterministic. It uses only the synthetic
fixtures under `tests/fixtures`.

## Run

Validate a request:

```powershell
node src/cli.ts validate --input job.json
```

Generate with the default Claude CLI provider:

```powershell
node src/cli.ts generate --input job.json --output result.json
```

Machine-to-machine callers can use JSON stdin/stdout:

```powershell
Get-Content job.json -Raw | node src/cli.ts generate --input -
```

Render and inspect the deterministic prompt without calling a provider:

```powershell
node src/cli.ts render-prompt --input job.json
```

The installed bin exposes the same commands as `sentra-concept-generator`.
`src/index.ts` exports the provider interface and all pure stages for an
in-process caller. The controlled fixture provider exists for tests only.

## External contract

The request schema is `sentra-concept-generator-request-v1`. A request carries:

- immutable transmitted evidence records and the exact packets the model may cite;
- the current concept rotation for source learning and dedup;
- dead-family/steering lessons for exclusion gates;
- generation and staging limits.

See [request.schema.json](schemas/request.schema.json) and the synthetic
[request fixture](tests/fixtures/request.json). Evidence passage hashes are
verified before any provider call. Referenced packets in the response must be
among those transmitted, and packet metadata must match exactly.

The result schema is `sentra-concept-generator-result-v1`; see
[result.schema.json](schemas/result.schema.json). The embedded model response
uses [model-output.schema.json](schemas/model-output.schema.json).

## Configuration

Safe, non-secret variables are documented in [.env.example](.env.example).
The application deliberately does not load `.env` files. Configure the process
environment through the machine's normal secret/configuration mechanism.

The live provider variables are:

- `SCG_PROVIDER`: `claude-cli` by default.
- `SCG_CLAUDE_CMD`: optional Claude executable path or command name.
- `SCG_MODEL`: optional Claude model; an empty value uses the CLI default.
- `SCG_TIMEOUT_MS`: provider timeout, capped at 30 minutes.
- `SCG_STAGING_CAP`: default downstream survivor cap.

No API-key variable is required or read by this repository.

## Scientific and safety fences

- Supplied packets are the only evidence. General model knowledge is not evidence.
- Abstract packets remain abstract-only evidence.
- Exact whole-response JSON is required; markdown or surrounding prose is refused.
- Passage echoes are audit diagnostics; packet identity and metadata are enforced.
- Falsifier specifications must resolve against the extracted instrument surfaces.
- Output is staging-only and requires operator semantic review. This project does
  not approve concepts, enroll workers, run factories, touch holdout data, or
  write back to Sentra.

## Documentation

- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Pre-extraction dependency graph](docs/DEPENDENCY-GRAPH.md)
- [Source provenance and equivalence](docs/PROVENANCE.md)

## Development

`npm test` runs only Node's built-in test runner. The suite covers request
validation, provider failure, strict output validation, grounding, prompt and
deterministic-stage equivalence snapshots, normalization/dedup, valid-zero
behavior, CLI files, and JSON stdin/stdout.

This repository starts with fresh independent Git history. The upstream source
lineage is documentary only; no Git metadata, symlink, submodule, package path,
or runtime import points back into Sentra.
