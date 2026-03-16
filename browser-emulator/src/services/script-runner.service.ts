import {
	ChildProcess,
	spawn,
	exec,
	type StdioOptions,
} from 'node:child_process';

/**
 * Options for running a script with ScriptRunnerService
 * detached: whether to run the script in detached mode (default: false)
 * stdinIO: how to handle stdin (default: 'pipe')
 * stdoutIO: how to handle stdout (default: 'pipe')
 * stderrIO: how to handle stderr (default: 'pipe')
 * stdoutCallback: optional callback to handle stdout data chunks. If stdoutIO is not set to 'pipe', this will be ignored.
 * stderrCallback: optional callback to handle stderr data chunks. If stderrIO is not set to 'pipe', this will be ignored.
 * Warning: if using detached mode with stdoutIO or stderrIO set to a file descriptor, and you are just using that file for logging an output,
 * the file descriptor will not be automatically closed when the child process exits.
 * It is recommended to close it yourself after calling run(), to avoid Node warnings (in the future possible errors)
 * (the child process inherits the file descriptor, so it is probably not needed anymore for the parent process).
 */
export interface ScriptRunOptions {
	detached?: boolean;
	stdio?: StdioOptions;
	stdoutCallback?: (chunk: string) => void;
	stderrCallback?: (chunk: string) => void;
	stdoutBufferCallback?: (chunk: Buffer) => void;
	stderrBufferCallback?: (chunk: Buffer) => void;
	onCloseCallback?: (code: number | null) => void;
	onErrorCallback?: (err: Error) => void;
}

export class ScriptRunnerService {
	private readonly detachedProcessCache = new Map<number, string>();

	public async run(
		script: string,
		options?: ScriptRunOptions,
	): Promise<ChildProcess> {
		console.log(`Running script: ${script}`);
		if (options) {
			console.log(`With options: ${JSON.stringify(options)}`);
		}
		return new Promise((resolve, reject) => {
			const detached = options?.detached ?? false;
			const finalStdio: StdioOptions = options?.stdio ?? [
				detached ? 'ignore' : 'pipe',
				'pipe',
				'pipe',
			];

			const { command, args } =
				this.splitScriptIntoCommandAndArgs(script);

			const execProcess = spawn(command, args, {
				cwd: process.cwd(),
				detached,
				stdio: finalStdio,
			});

			this.handleStdout(execProcess, options);
			this.handleStderr(execProcess, options);

			if (execProcess.pid === undefined) {
				reject(new Error('Failed to start script, no PID assigned'));
				return;
			}
			if (detached) {
				this.detachedProcessCache.set(execProcess.pid, script);
				this.setupDetachedHandlers(execProcess, options);
				resolve(execProcess);
			} else {
				this.setupOtherHandlers(execProcess, options, resolve, reject);
			}
		});
	}

	private getQueryTokens(query: string): string[] {
		return query
			.toLowerCase()
			.split(' ')
			.filter(token => token.length > 0);
	}

	private matchesAllTokens(source: string, queryTokens: string[]): boolean {
		const lowerSource = source.toLowerCase();
		return queryTokens.every(token => lowerSource.includes(token));
	}

	private hasAnyMatchingLine(output: string, queryTokens: string[]): boolean {
		const lines = output
			.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0);

		return lines.some(line => this.matchesAllTokens(line, queryTokens));
	}

	private async waitUntilProcessStops(
		pid: number,
		timeoutMs = 5000,
	): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			const checkTimeout = setTimeout(() => {
				clearInterval(checkInterval);
				console.warn(
					`Timeout (${timeoutMs}ms) waiting for process ${pid} to die`,
				);
				resolve(false);
			}, timeoutMs);
			const checkInterval = setInterval(() => {
				try {
					process.kill(pid, 0); // Check if process exists
				} catch {
					clearTimeout(checkTimeout);
					console.log(`Process ${pid} confirmed killed`);
					clearInterval(checkInterval);
					resolve(true);
				}
			}, 100);
		});
	}

	private sendSignal(pid: number, signal: NodeJS.Signals): boolean {
		try {
			process.kill(-pid, 0);
		} catch {
			console.log(
				`Process ${pid} does not exist, no need to send ${signal}`,
			);
			return true; // Process already dead, consider it a success
		}
		try {
			console.log(`Sending ${signal} to PID: ${pid} (process group)`);
			process.kill(-pid, signal);
			return true;
		} catch (err) {
			// If process group fails, try without it
			try {
				process.kill(pid, 0);
			} catch {
				console.log(
					`Process ${pid} does not exist, no need to send ${signal}`,
				);
				return true; // Process already dead, consider it a success
			}
			try {
				console.warn(
					`Process group kill failed, retrying without group: ${String(err)}`,
				);
				process.kill(pid, signal);
				return true;
			} catch (retryError) {
				console.error(
					`Failed to send ${signal} to PID ${pid}:`,
					retryError,
				);
				return false;
			}
		}
	}

	private async killProcessWithEscalation(pid: number): Promise<void> {
		const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGKILL'];
		const timeouts = [5000, 5000, 5000]; // 5 seconds for each signal

		for (let i = 0; i < signals.length; i++) {
			const signal = signals[i];
			const timeout = timeouts[i];

			const signalSent = this.sendSignal(pid, signal);
			if (!signalSent) {
				// If we can't send the signal, the process might already be dead
				try {
					process.kill(pid, 0);
					// Process still exists but we can't kill it
					if (i === signals.length - 1) {
						throw new Error(
							`Unable to send any signal to process ${pid}`,
						);
					}
					continue;
				} catch {
					// Process doesn't exist, we're done
					console.log(`Process ${pid} no longer exists`);
					return;
				}
			}

			const stopped = await this.waitUntilProcessStops(pid, timeout);
			if (stopped) {
				return; // Successfully killed
			}

			console.warn(
				`${signal} did not stop process ${pid}, escalating...`,
			);
		}

		throw new Error(`Failed to kill process ${pid} even with SIGKILL`);
	}

	private handleStdout(
		execProcess: ChildProcess,
		options?: ScriptRunOptions,
	) {
		this.handleStream(
			execProcess.stdout,
			options?.stdoutBufferCallback,
			options?.stdoutCallback,
			console.log,
		);
	}

	private handleStderr(
		execProcess: ChildProcess,
		options?: ScriptRunOptions,
	) {
		this.handleStream(
			execProcess.stderr,
			options?.stderrBufferCallback,
			options?.stderrCallback,
			console.error,
		);
	}

	private handleStream(
		stream: NodeJS.ReadableStream | null,
		bufferCallback?: (chunk: Buffer) => void,
		callback?: (chunk: string) => void,
		defaultHandler?: (message: string) => void,
	) {
		if (stream) {
			stream.on('data', (data: Buffer) => {
				bufferCallback?.(data);
				const output = data.toString();
				if (callback) {
					callback(output);
				} else if (defaultHandler) {
					defaultHandler(output);
				}
			});
		}
	}

	private setupOtherHandlers(
		execProcess: ChildProcess,
		options: ScriptRunOptions | undefined,
		resolve: (value: ChildProcess) => void,
		reject: (reason: Error) => void,
	) {
		execProcess.on('close', code => {
			options?.onCloseCallback?.(code);
			if (code === 0) {
				resolve(execProcess);
			} else {
				console.error(`exit code ${code}`);
				reject(
					new Error(
						`Script ${execProcess.pid} exited with code ${code}`,
					),
				);
			}
		});
		execProcess.on('error', err => {
			options?.onErrorCallback?.(err);
			console.error(`Error executing script ${execProcess.pid}: ${err}`);
			reject(err);
		});
		execProcess.on('spawn', () => {
			console.log(`Script started with PID ${execProcess.pid}`);
		});
		execProcess.on('disconnect', () => {
			console.warn(`Child process ${execProcess.pid} disconnected`);
		});
		execProcess.on('exit', (code, signal) => {
			const signalString = signal ? ` and signal ${signal}` : '';
			console.log(
				`Child process ${execProcess.pid} exited with code ${code}${signalString}`,
			);
		});
	}

	private setupDetachedHandlers(
		execProcess: ChildProcess,
		options: ScriptRunOptions | undefined,
	) {
		execProcess.on('close', code => {
			options?.onCloseCallback?.(code);
			this.detachedProcessCache.delete(execProcess.pid!);
			if (code === 0) {
				console.log(
					`Detached script ${execProcess.pid} exited successfully with code ${code}`,
				);
			} else {
				console.error(
					`Detached script ${execProcess.pid} exited with code ${code}`,
				);
			}
		});

		execProcess.on('error', err => {
			options?.onErrorCallback?.(err);
			console.error(
				`Error in detached script with PID ${execProcess.pid}: ${err}`,
			);
		});
	}

	private splitScriptIntoCommandAndArgs(script: string): {
		command: string;
		args: string[];
	} {
		const args: string[] = [];
		let currentArg = '';
		let inQuotes = false;

		for (const element of script) {
			const char = element;

			if (char === '"') {
				inQuotes = !inQuotes;
			} else if (char === ' ' && !inQuotes) {
				if (currentArg.length > 0) {
					args.push(currentArg);
					currentArg = '';
				}
			} else {
				currentArg += char;
			}
		}

		if (currentArg.length > 0) {
			args.push(currentArg);
		}

		const command = args.shift() ?? '';
		return { command, args };
	}

	public async killDetached(process: ChildProcess) {
		const pid = process.pid;
		if (!pid) {
			console.warn('Process has no PID, cannot kill');
			return;
		}

		await this.killProcessWithEscalation(pid);
		this.detachedProcessCache.delete(pid);
	}

	public async killAllDetached() {
		const pids = Array.from(this.detachedProcessCache.keys());
		if (pids.length === 0) {
			console.log('No detached processes to kill');
			return;
		}
		console.log(`Detached processes to kill: `);
		for (const [pid, script] of this.detachedProcessCache.entries()) {
			console.log(`${script} (PID: ${pid})`);
		}

		const killPromises = pids.map(async pid => {
			try {
				await this.killProcessWithEscalation(pid);
			} catch (err) {
				console.error(`Failed to kill process ${pid}:`, err);
				// Continue killing other processes even if one fails
			}
		});

		await Promise.allSettled(killPromises);
		this.detachedProcessCache.clear();
	}

	public async isRunning(query: string) {
		const queryTokens = this.getQueryTokens(query);

		for (const [pid, cachedScript] of this.detachedProcessCache.entries()) {
			const cachedLine = `${pid} ${cachedScript}`;
			if (this.matchesAllTokens(cachedLine, queryTokens)) {
				return true;
			}
		}

		const cmd = `ps -Awwf`;
		return new Promise<boolean>((resolve, reject) =>
			exec(cmd, (err, stdout) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(this.hasAnyMatchingLine(stdout, queryTokens));
			}),
		);
	}
}
