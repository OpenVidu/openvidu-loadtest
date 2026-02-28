import { ChildProcess, spawn, exec } from 'node:child_process';
import fs from 'node:fs';

const detachedPids: number[] = [];

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
		execProcess.stdout.on('data', options.stdoutCallback);
	} else {
		execProcess.stdout.on('data', data => {
			console.log(data.toString());
		});
	}
}

function handleStderr(execProcess: ChildProcess) {
	if (execProcess.stderr) {
		execProcess.stderr.on('data', data => {
			console.error(data.toString());
		});
	}
}

function setupExitHandler(
	execProcess: ChildProcess,
	resolve: (value: ChildProcess) => void,
	reject: (reason?: any) => void,
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

export function killAllDetached() {
	console.log('PIDs to kill: ' + detachedPids);
	detachedPids.forEach(pid => {
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
	});
}

export async function isRunning(query: string) {
	let cmd = `ps -Awwf`;
	return new Promise((resolve, reject) =>
		exec(cmd, (err, stdout, _) => {
			if (err) reject(err);
			const condition = stdout
				.toLowerCase()
				.includes(query.toLowerCase());
			resolve(condition);
		}),
	);
}
