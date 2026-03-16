import type { ScriptRunnerService } from '../script-runner.service.ts';
import os from 'node:os';
import pLimit, { type LimitFunction } from 'p-limit';

export class QoeCommandRunner {
	private readonly scriptRunnerService: ScriptRunnerService;
	private configuredConcurrency = os.availableParallelism();
	private sharedLimiter: LimitFunction;

	constructor(scriptRunnerService: ScriptRunnerService) {
		this.scriptRunnerService = scriptRunnerService;
		this.sharedLimiter = pLimit(this.configuredConcurrency);
	}

	public configureQoeGlobalLimiter(maxConcurrency?: number): number {
		const nextConcurrency = this.normalizeConcurrency(maxConcurrency);
		this.configuredConcurrency = nextConcurrency;
		this.sharedLimiter = pLimit(nextConcurrency);
		return this.configuredConcurrency;
	}

	private normalizeConcurrency(maxConcurrency?: number): number {
		if (
			typeof maxConcurrency !== 'number' ||
			!Number.isFinite(maxConcurrency)
		) {
			return os.availableParallelism();
		}
		return Math.max(1, Math.floor(maxConcurrency));
	}

	private runWithQoeGlobalLimit<T>(task: () => Promise<T>): Promise<T> {
		return this.sharedLimiter(task);
	}

	public async runAndCapture(command: string): Promise<string> {
		let stdout = '';
		let stderr = '';
		await this.runWithQoeGlobalLimit(async () => {
			await this.scriptRunnerService.run(command, {
				stdoutCallback: chunk => {
					stdout += chunk;
				},
				stderrCallback: chunk => {
					stderr += chunk;
				},
			});
		});
		return `${stdout}\n${stderr}`.trim();
	}

	public async streamRawFrames(
		command: string,
		onChunk: (chunk: Buffer) => void,
	): Promise<void> {
		await this.runWithQoeGlobalLimit(async () => {
			await this.scriptRunnerService.run(command, {
				stdoutBufferCallback: onChunk,
				stdoutCallback: () => {
					// Prevent default stdout logging for binary frame data.
				},
			});
		});
	}

	public quote(value: string): string {
		const escaped = value.replaceAll('"', String.raw`\"`);
		return `"${escaped}"`;
	}
}
