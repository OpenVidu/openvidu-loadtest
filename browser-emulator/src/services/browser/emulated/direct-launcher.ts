import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import type { LoggerService } from '../../logger.service.ts';
import type { ConfigService } from '../../config.service.ts';
import type {
	EmulatedParticipantLauncher,
	ParticipantHandle,
} from './emulated-participant-launcher.ts';

const DEFAULT_LK_CLI_PATH = '/usr/local/bin/lk';

interface ProcessEntry {
	process: ChildProcess;
	stdout: string[];
	stderr: string[];
	maxBufferLines: number;
}

export class DirectLauncher implements EmulatedParticipantLauncher {
	readonly mode = 'direct' as const;

	private readonly logger: ReturnType<LoggerService['getLogger']>;
	private readonly lkCliPath: string;
	private readonly lkProfileDir: string;

	private readonly processes = new Map<string, ProcessEntry>();
	private readonly LOG_POLL_INTERVAL_MS = 500;
	private readonly MAX_LOG_WAIT_MS = 15_000;
	private readonly MAX_LOG_LINES = 500;
	private readonly KILL_TIMEOUT_MS = 5_000;

	constructor(
		loggerService: LoggerService,
		lkCliPath?: string,
		configService?: ConfigService,
	) {
		this.logger = loggerService.getLogger('DirectLauncher');
		this.lkCliPath = lkCliPath ?? DEFAULT_LK_CLI_PATH;
		this.lkProfileDir = configService?.getLkProfileDir() ?? '';
	}

	async ensureBinaryExists(): Promise<void> {
		try {
			await fs.access(this.lkCliPath, fs.constants.X_OK);
		} catch {
			throw new Error(
				`lk binary not found at ${this.lkCliPath}. ` +
					`Install it or set LIVEKIT_CLI_PATH environment variable.`,
			);
		}
	}

	private buildCommand(command: string[]): string[] {
		return [this.lkCliPath, ...command];
	}

	async createParticipant(
		command: string[],
		participantId: string,
		sessionName: string,
		userName: string,
		videoSocket?: string,
		audioSocket?: string,
	): Promise<ParticipantHandle> {
		await this.ensureBinaryExists();

		const profilingFlags: string[] = [];
		if (this.lkProfileDir) {
			profilingFlags.push(
				'--cpuprofile',
				`${this.lkProfileDir}/${participantId}.cpu.pprof`,
				'--memprofile',
				`${this.lkProfileDir}/${participantId}.mem.pprof`,
			);
		}

		const fullCommand = this.buildCommand([...command, ...profilingFlags]);

		this.logger.info(
			{ participantId, command: fullCommand.join(' ') },
			'Starting lk process',
		);

		const proc = spawn(fullCommand[0], fullCommand.slice(1), {
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		const pid = String(proc.pid);

		const entry: ProcessEntry = {
			process: proc,
			stdout: [],
			stderr: [],
			maxBufferLines: this.MAX_LOG_LINES,
		};

		proc.stdout?.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n').filter(Boolean);
			for (const line of lines) {
				entry.stdout.push(line);
				if (entry.stdout.length > entry.maxBufferLines) {
					entry.stdout.shift();
				}
			}
		});

		proc.stderr?.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n').filter(Boolean);
			for (const line of lines) {
				entry.stderr.push(line);
				if (entry.stderr.length > entry.maxBufferLines) {
					entry.stderr.shift();
				}
			}
		});

		proc.on('error', (err: Error) => {
			this.logger.error({ pid, error: err.message }, 'lk process error');
		});

		proc.on('exit', (code: number | null, signal: string | null) => {
			this.logger.info({ pid, code, signal }, 'lk process exited');
		});

		this.processes.set(pid, entry);

		return {
			participantId,
			handleId: pid,
			sessionName,
			userName,
			videoSocket,
			audioSocket,
			createdAt: new Date(),
		};
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async isRunning(handleId: string): Promise<boolean> {
		const pid = Number(handleId);
		if (Number.isNaN(pid)) return false;

		try {
			return process.kill(pid, 0);
		} catch {
			return false;
		}
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async getLogs(handleId: string): Promise<string> {
		const entry = this.processes.get(handleId);
		if (!entry) return '';

		const lines = [
			'--- stdout ---',
			...entry.stdout,
			'--- stderr ---',
			...entry.stderr,
		];

		return lines.join('\n');
	}

	async stop(handleId: string): Promise<void> {
		const entry = this.processes.get(handleId);
		if (!entry) return;

		return new Promise<void>(resolve => {
			const pid = Number(handleId);
			if (Number.isNaN(pid)) {
				this.processes.delete(handleId);
				resolve();
				return;
			}

			const killTimeout = setTimeout(() => {
				try {
					process.kill(pid, 'SIGKILL');
				} catch {
					// already dead
				}
			}, this.KILL_TIMEOUT_MS);

			entry.process.on('exit', () => {
				clearTimeout(killTimeout);
				this.processes.delete(handleId);
				resolve();
			});

			try {
				process.kill(pid, 'SIGTERM');
			} catch {
				clearTimeout(killTimeout);
				this.processes.delete(handleId);
				resolve();
			}
		});
	}
}
