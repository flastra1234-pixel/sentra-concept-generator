import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  GenerationProvider,
  GeneratorRequest,
  ProviderResponse,
} from './types.ts';

export class ProviderError extends Error {
  readonly code:
    | 'PROVIDER_COMMAND_NOT_FOUND'
    | 'PROVIDER_SPAWN_FAILED'
    | 'PROVIDER_TIMEOUT'
    | 'PROVIDER_EXIT_NONZERO'
    | 'PROVIDER_EMPTY_RESPONSE'
    | 'PROVIDER_PROVENANCE_MISMATCH';

  constructor(
    code:
      | 'PROVIDER_COMMAND_NOT_FOUND'
      | 'PROVIDER_SPAWN_FAILED'
      | 'PROVIDER_TIMEOUT'
      | 'PROVIDER_EXIT_NONZERO'
      | 'PROVIDER_EMPTY_RESPONSE'
      | 'PROVIDER_PROVENANCE_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_TIMEOUT_MS = 30 * 60 * 1000;
const ALLOWED_TOOLS = ['Read', 'Grep', 'Glob'];

export function defaultClaudeCommand(): string {
  const configured =
    process.env.SCG_CLAUDE_CMD ?? process.env.SENTRA_CLAUDE_CMD;
  if (configured?.trim()) return configured.trim();
  if (process.platform === 'win32') {
    const candidate = join(
      process.env.APPDATA ?? '',
      'npm',
      'node_modules',
      '@anthropic-ai',
      'claude-code',
      'bin',
      'claude.exe',
    );
    if (existsSync(candidate)) return candidate;
  }
  return 'claude';
}

export function claudeSessionArgs(model = ''): string[] {
  return [
    '-p',
    ...(model ? ['--model', model] : []),
    '--allowed-tools',
    ...ALLOWED_TOOLS,
  ];
}

function timeoutMs(): number {
  const value = Number(process.env.SCG_TIMEOUT_MS ?? MAX_TIMEOUT_MS);
  if (!Number.isFinite(value)) return MAX_TIMEOUT_MS;
  return Math.max(10, Math.min(value, MAX_TIMEOUT_MS));
}

export function claudeCliProvider(): GenerationProvider {
  const command = defaultClaudeCommand();
  const model = String(process.env.SCG_MODEL ?? '').trim();
  const modelId = model || 'CLI default';
  const configuredTimeoutMs = timeoutMs();
  return {
    descriptor: {
      provider_id: 'claude-cli',
      model_id: modelId,
      execution_origin: 'CLAUDE_CLI',
      timeout_ms: configuredTimeoutMs,
    },
    async generate({
      prompt,
    }: {
      prompt: string;
      request: GeneratorRequest;
    }): Promise<ProviderResponse> {
      const promptBytes = Buffer.from(prompt, 'utf8');
      return await new Promise<ProviderResponse>((resolveResponse, reject) => {
        let settled = false;
        let output = '';
        let killed = false;
        const done = (
          error: ProviderError | null,
          response?: ProviderResponse,
        ): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolveResponse(response!);
        };
        let child;
        try {
          child = spawn(command, claudeSessionArgs(model), {
            cwd: REPO_ROOT,
            windowsHide: true,
            shell: false,
            env: { ...process.env },
          });
        } catch (error) {
          throw new ProviderError(
            'PROVIDER_SPAWN_FAILED',
            `failed to spawn Claude CLI: ${(error as Error).message}`,
          );
        }
        const capture = (chunk: Buffer): void => {
          output += chunk.toString();
          if (output.length > 2_000_000) {
            output = output.slice(-1_000_000);
          }
        };
        child.stdout?.on('data', capture);
        child.stderr?.on('data', capture);
        child.stdin?.on('error', () => undefined);
        try {
          child.stdin?.write(promptBytes);
          child.stdin?.end();
        } catch {
          // The process close/error event is authoritative.
        }
        const timer = setTimeout(() => {
          killed = true;
          try {
            child.kill();
          } catch {
            // already gone
          }
          if (process.platform === 'win32' && child.pid) {
            try {
              spawn(
                'taskkill',
                ['/PID', String(child.pid), '/T', '/F'],
                { windowsHide: true, shell: false, stdio: 'ignore' },
              ).on('error', () => undefined);
            } catch {
              // best effort
            }
          }
          done(
            new ProviderError(
              'PROVIDER_TIMEOUT',
              `Claude CLI exceeded ${configuredTimeoutMs}ms`,
            ),
          );
        }, configuredTimeoutMs);
        child.on('error', (error: NodeJS.ErrnoException) => {
          done(
            new ProviderError(
              error.code === 'ENOENT'
                ? 'PROVIDER_COMMAND_NOT_FOUND'
                : 'PROVIDER_SPAWN_FAILED',
              error.code === 'ENOENT'
                ? `Claude CLI executable was not found: ${command}`
                : `Claude CLI failed to spawn: ${error.message}`,
            ),
          );
        });
        child.on('close', (code) => {
          if (killed) return;
          if (code !== 0) {
            done(
              new ProviderError(
                'PROVIDER_EXIT_NONZERO',
                `Claude CLI exited with code ${String(code)}: ${output
                  .slice(-500)
                  .trim()}`,
              ),
            );
            return;
          }
          if (!output.trim()) {
            done(
              new ProviderError(
                'PROVIDER_EMPTY_RESPONSE',
                'Claude CLI returned an empty response',
              ),
            );
            return;
          }
          done(null, {
            raw: output,
            provider_id: 'claude-cli',
            model_id: modelId,
            execution_origin: 'CLAUDE_CLI',
          });
        });
      });
    },
  };
}

export function fixtureProvider(
  raw: string,
  modelId = 'fixture-generator',
): GenerationProvider {
  return {
    descriptor: {
      provider_id: 'fixture',
      model_id: modelId,
      execution_origin: 'OPERATOR_FIXTURE',
      timeout_ms: 1_000,
    },
    async generate() {
      return {
        raw,
        provider_id: 'fixture',
        model_id: modelId,
        execution_origin: 'OPERATOR_FIXTURE',
      };
    },
  };
}
