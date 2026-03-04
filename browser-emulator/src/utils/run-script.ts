import { ChildProcess, spawn, exec } from 'node:child_process';
import fs from 'node:fs';

const detachedPids: number[] = [];

function chunkToString(chunk: unknown): string {
	if (typeof chunk === 'string') return chunk;
	if (Buffer.isBuffer(chunk)) return chunk.toString();
	return String(chunk);
}

function handleStdout(
	execProcess: ChildProcess,
	options?: {
		redirectStdoutToFile?: string;
		stdoutCallback?: (chunk: string) => void;
	},
) {
	if (!execProcess.stdout) return;

	if (options?.redirectStdoutToFile) {
		execProcess.stdout.pipe(
			fs.createWriteStream(options.redirectStdoutToFile),
		);
	} else if (options?.stdoutCallback) {
		execProcess.stdout.on('data', data => {
			options.stdoutCallback?.(chunkToString(data));
		});
	} else {
		execProcess.stdout.on('data', data => {
			console.log(chunkToString(data));
		});
	}
}

function handleStderr(execProcess: ChildProcess) {
	if (execProcess.stderr) {
		execProcess.stderr.on('data', data => {
			console.error(chunkToString(data));
		});
	}
}

function setupExitHandler(
	execProcess: ChildProcess,
	resolve: (value: ChildProcess) => void,
	reject: (reason: Error) => void,
) {
	execProcess.on('exit', code => {
		if (code === 0) {
			resolve(execProcess);
		} else {
			console.error(`exit code ${code}`);
			reject(new Error(`Script exited with code ${code}`));
		}
	});
}

export async function runScript(
	script: string,
	options?: {
		detached?: boolean;
		ignoreLogs?: boolean;
		redirectStdoutToFile?: string;
		stdoutCallback?: (chunk: string) => void;
	},
): Promise<ChildProcess> {
	console.log(script);
	return new Promise((resolve, reject) => {
		const detached = options?.detached ?? false;
		const stdio: 'pipe' | 'ignore' = options?.ignoreLogs
			? 'ignore'
			: 'pipe';

		const execProcess = spawn(script, [], {
			cwd: `${process.cwd()}`,
			shell: '/bin/bash',
			detached,
			stdio,
		});

		if (detached && execProcess.pid) {
			detachedPids.push(execProcess.pid);
			resolve(execProcess);
		} else {
			handleStdout(execProcess, options);
			handleStderr(execProcess);
			setupExitHandler(execProcess, resolve, reject);
		}
	});
}

export function stopDetached(process: ChildProcess) {
	try {
		console.log('Stopping ' + process.pid);
		process.kill('SIGINT');
	} catch (err) {
		try {
			console.warn(err);
			console.log('Retrying stopping ' + process.pid);
			process.kill('SIGINT');
		} catch (retryError) {
			console.error(retryError);
		}
	}
}

export async function killAllDetached() {
	console.log(`PIDs to kill: [${detachedPids.join(', ')}]`);
	const killPromises = detachedPids.map(
		pid =>
			new Promise<void>((resolve, reject) => {
				try {
					console.log('Killing ' + pid);
					process.kill(-pid);
				} catch (err) {
					try {
						console.warn(err);
						console.log('Retrying killing ' + pid);
						process.kill(pid);
					} catch (retryError) {
						console.error(retryError);
					}
				}

				// Wait and verify process is killed
				const checkInterval = setInterval(() => {
					try {
						process.kill(pid, 0); // Check if process exists
					} catch {
						// Process doesn't exist anymore
						console.log(`Process ${pid} confirmed killed`);
						clearInterval(checkInterval);
						resolve();
					}
				}, 100);

				// Timeout after 20 seconds
				setTimeout(() => {
					clearInterval(checkInterval);
					reject(
						new Error(`Timeout waiting for process ${pid} to die`),
					);
				}, 20000);
			}),
	);

	await Promise.all(killPromises);
	detachedPids.length = 0;
}

export async function isRunning(query: string) {
	const cmd = `ps -Awwf`;
	return new Promise((resolve, reject) =>
		exec(cmd, (err, stdout) => {
			if (err) reject(err);
			const condition = stdout
				.toLowerCase()
				.includes(query.toLowerCase());
			resolve(condition);
		}),
	);
}
