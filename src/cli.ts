#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

import { generateConcepts, renderGeneratorPrompt } from './generator.ts';
import {
  claudeCliProvider,
  defaultClaudeCommand,
  fixtureProvider,
  ProviderError,
} from './provider.ts';
import { RequestValidationError, validateRequest } from './request.ts';

interface Arguments {
  command: 'generate' | 'render-prompt' | 'validate' | 'doctor';
  input: string;
  output: string | null;
  provider: string;
  responseFile: string | null;
}

function usage(): string {
  return [
    'Sentra Concept Generator',
    '',
    'Usage:',
    '  sentra-concept-generator generate --input request.json [--output result.json]',
    '  sentra-concept-generator generate --input - --provider fixture --response-file response.json',
    '  sentra-concept-generator render-prompt --input request.json',
    '  sentra-concept-generator validate --input request.json',
    '  sentra-concept-generator doctor',
    '',
    'JSON input is read from stdin (-) by default. The default provider is SCG_PROVIDER or claude-cli.',
  ].join('\n');
}

function parseArguments(argv: string[]): Arguments {
  const first = argv[0] ?? 'generate';
  if (first === '--help' || first === '-h' || first === 'help') {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  if (!['generate', 'render-prompt', 'validate', 'doctor'].includes(first)) {
    throw new Error(`unknown command: ${first}`);
  }
  const options = new Map<string, string>();
  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for ${key}`);
    }
    options.set(key, value);
    i += 1;
  }
  return {
    command: first as Arguments['command'],
    input: options.get('--input') ?? '-',
    output: options.get('--output') ?? null,
    provider:
      options.get('--provider') ?? process.env.SCG_PROVIDER ?? 'claude-cli',
    responseFile: options.get('--response-file') ?? null,
  };
}

function readUtf8(path: string): string {
  if (path === '-') return readFileSync(0, 'utf8');
  return readFileSync(resolve(path), 'utf8');
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readUtf8(path));
  } catch (error) {
    throw new Error(`could not parse JSON input ${path}: ${(error as Error).message}`);
  }
}

function emit(value: unknown, output: string | null): void {
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  if (output) writeFileSync(resolve(output), rendered, 'utf8');
  else process.stdout.write(rendered);
}

function commandExists(command: string): boolean {
  if (/[\\/]/.test(command)) return existsSync(resolve(command));
  const result = spawnSync(command, ['--version'], {
    windowsHide: true,
    shell: false,
    encoding: 'utf8',
    timeout: 10_000,
  });
  return !result.error;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.command === 'doctor') {
    const command = defaultClaudeCommand();
    const nodeOk = Number(process.versions.node.split('.')[0]) >= 24;
    const providerOk = commandExists(command);
    emit(
      {
        ok: nodeOk && providerOk,
        node: { version: process.versions.node, supported: nodeOk },
        provider: {
          kind: 'claude-cli',
          command,
          available: providerOk,
          model: process.env.SCG_MODEL?.trim() || 'CLI default',
        },
      },
      args.output,
    );
    if (!nodeOk || !providerOk) process.exitCode = 2;
    return;
  }

  const input = readJson(args.input);
  if (args.command === 'validate') {
    const request = validateRequest(input);
    emit(
      {
        valid: true,
        schema_version: request.schema_version,
        request_id: request.request_id,
        transmitted_sources: request.transmitted_sources.length,
      },
      args.output,
    );
    return;
  }
  if (args.command === 'render-prompt') {
    const rendered = renderGeneratorPrompt(input);
    emit(
      {
        prompt_version: 'GROUNDED_SOURCE_PROMPT_V2',
        prompt_sha256: rendered.prompt_sha256,
        prompt_bytes: rendered.prompt_bytes,
        approximate_tokens: rendered.approximate_tokens,
        prompt: rendered.prompt,
      },
      args.output,
    );
    return;
  }

  const provider = (() => {
    if (args.provider === 'claude-cli') return claudeCliProvider();
    if (args.provider === 'fixture') {
      if (!args.responseFile) {
        throw new Error('--response-file is required with --provider fixture');
      }
      return fixtureProvider(readUtf8(args.responseFile));
    }
    throw new Error(`unsupported provider: ${args.provider}`);
  })();
  const result = await generateConcepts(input, provider);
  emit(result, args.output);
  if (result.result_type === 'OPERATIONAL_FAILURE') process.exitCode = 3;
}

main().catch((error: unknown) => {
  const body = {
    ok: false,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: 'Error', message: String(error) },
    issues:
      error instanceof RequestValidationError ? error.issues : undefined,
    code: error instanceof ProviderError ? error.code : undefined,
  };
  process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
  process.exitCode = 2;
});
