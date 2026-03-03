#!/usr/bin/env node

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

interface RunOptions {
	livekit: boolean;
	nodeName: string;
	timeoutSeconds: number;
	halt: boolean;
	destroy: boolean;
	coverage: boolean;
	debug: boolean;
}

function printUsage(): void {
	console.log(`Usage: tsx ./dev_scripts/run-tests-vagrant.ts [options]

Options:
  --livekit           Wait for LiveKit readiness (default: OpenVidu)
  --node=<name>       Vagrant machine name (default: node1)
  --timeout=<secs>    Readiness timeout in seconds (default: 600, 10 minutes)
  --coverage          Run tests with coverage (test:all:native:coverage)
  --debug             Enable Node debugger (port 9229 forwarded to host)
  --halt              Halt VM after successful execution (vagrant halt)
  --destroy           Destroy VM after successful execution (vagrant destroy -f)
  --help              Show this help
`);
}

function parseArgs(argv: string[]): RunOptions {
	const options: RunOptions = {
		livekit: false,
		nodeName: 'node1',
		timeoutSeconds: 600,
		halt: false,
		destroy: false,
		coverage: false,
		debug: false,
	};

	for (const arg of argv) {
		if (arg === '--livekit') {
			options.livekit = true;
		} else if (arg === '--coverage') {
			options.coverage = true;
		} else if (arg === '--debug') {
			options.debug = true;
		} else if (arg === '--halt') {
			options.halt = true;
		} else if (arg === '--destroy') {
			options.destroy = true;
		} else if (arg === '--help' || arg === '-h') {
			printUsage();
			process.exit(0);
		} else if (arg.startsWith('--node=')) {
			options.nodeName = arg.slice('--node='.length);
		} else if (arg.startsWith('--timeout=')) {
			const parsed = Number(arg.slice('--timeout='.length));
			if (!Number.isFinite(parsed) || parsed <= 0) {
				throw new Error(`Invalid timeout value: ${arg}`);
			}
			options.timeoutSeconds = parsed;
		} else {
			throw new Error(`Unknown option: ${arg}`);
		}
	}

	return options;
}

function runCommand(
	command: string,
	args: string[],
	options?: { capture?: boolean; allowFailure?: boolean },
): { status: number; stdout?: string; stderr?: string } {
	process.env.START_SERVER = 'false';
	const result = spawnSync(command, args, {
		encoding: 'utf-8',
		stdio: options?.capture ? 'pipe' : 'inherit',
		shell: false,
	});

	if (result.error) {
		throw result.error;
	}

	const status = result.status ?? 1;
	if (status !== 0 && !options?.allowFailure) {
		if (options?.capture && result.stderr) {
			process.stderr.write(result.stderr);
		}
		throw new Error(
			`Command failed (${status}): ${command} ${args.join(' ')}`,
		);
	}

	return {
		status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function runVagrant(machine: string, ...vagrantArgs: string[]): void {
	runCommand('vagrant', [...vagrantArgs, machine]);
}

function runVagrantCapture(
	machine: string,
	command: string,
): { status: number; stdout?: string; stderr?: string } {
	return runCommand('vagrant', ['ssh', machine, '-c', command], {
		capture: true,
		allowFailure: true,
	});
}

function nowStamp(): string {
	const date = new Date();
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sleep(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function getVagrantStatus(machine: string): 'up' | 'down' | 'unknown' {
	const result = runCommand('vagrant', ['status', machine], {
		capture: true,
		allowFailure: true,
	});

	if ((result.status ?? 1) !== 0) {
		return 'unknown';
	}

	const output = result.stdout?.toLowerCase() ?? '';
	if (output.includes('running')) {
		return 'up';
	}
	if (output.includes('not created')) {
		return 'down';
	}

	return 'unknown';
}

function computeProvisionFilesHash(files: string[]): string {
	const hash = createHash('sha256');

	for (const file of files) {
		try {
			const content = readFileSync(file, 'utf-8');
			hash.update(content);
		} catch {
			// File not found or not readable; skip
		}
	}

	return hash.digest('hex');
}

function getPreviousHash(cacheFile: string): string | null {
	try {
		return readFileSync(cacheFile, 'utf-8').trim();
	} catch {
		return null;
	}
}

function savePreviousHash(cacheFile: string, hash: string): void {
	mkdirSync(join(cacheFile, '..'), { recursive: true });
	writeFileSync(cacheFile, hash, 'utf-8');
}

function shouldProvision(machine: string): boolean {
	const provisionFiles = [
		'Vagrantfile',
		'vagrant_setup_start.sh',
		'package.json',
		'pnpm-lock.yaml',
	];

	const cacheFile = resolve('.vagrant', `provision-hash-${machine}`);
	const currentHash = computeProvisionFilesHash(provisionFiles);
	const previousHash = getPreviousHash(cacheFile);

	if (previousHash === null || currentHash !== previousHash) {
		savePreviousHash(cacheFile, currentHash);
		return true;
	}

	return false;
}

function handleVMState(machine: string): void {
	const status = getVagrantStatus(machine);

	if (status === 'down') {
		console.log(`VM ${machine} is down. Bringing it up...`);
		runVagrant(machine, 'up');
	} else if (status === 'up') {
		if (shouldProvision(machine)) {
			console.log(
				`VM ${machine} is up, but provisioning files changed. Running provisioning...`,
			);
			runVagrant(machine, 'up', '--provision');
		} else {
			console.log(
				`VM ${machine} is already up and no provisioning needed.`,
			);
		}
	} else {
		console.warn(
			`VM ${machine} status is unknown. Attempting to bring it up...`,
		);
		runVagrant(machine, 'up');
	}
}

function waitForPlatform(
	nodeName: string,
	livekit: boolean,
	timeoutSeconds: number,
): void {
	const maxAttempts = Math.ceil(timeoutSeconds / 2);
	const checkLabel = livekit ? 'LiveKit process' : 'OpenVidu endpoint';
	const checkCommand = livekit
		? "pgrep -af 'livekit-server --dev' >/dev/null"
		: "grep -qE '(OpenVidu Server URL|initialization completed)' /var/log/openvidu.log";

	console.log(`Waiting for ${checkLabel} (${timeoutSeconds}s timeout)...`);
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const result = runVagrantCapture(
			nodeName,
			`bash -lc "${checkCommand}"`,
		);
		if ((result.status ?? 1) === 0) {
			console.log(`${checkLabel} is ready.`);
			return;
		}
		if (attempt < maxAttempts) {
			sleep(2000);
		}
	}

	throw new Error(
		`Timed out waiting for ${checkLabel} after ${timeoutSeconds} seconds.`,
	);
}

function collectGuestLogs(nodeName: string, outputDir: string): void {
	mkdirSync(outputDir, { recursive: true });

	const logs = [
		'/var/log/openvidu.log',
		'/var/log/livekit.log',
		'/var/log/server.log',
		'/var/log/build.log',
		'/var/log/pnpm_install.log',
		'/var/log/tests.log',
		'/opt/openvidu-loadtest/browser-emulator/selenium.log',
	];

	const marker = '__VAGRANT_LOG_SPLIT__';
	const escapedQuote = String.raw`'\''`;
	const quotedLogs = logs
		.map(log => `'${log.replaceAll("'", escapedQuote)}'`)
		.join(' ');

	// Single vagrant ssh command; stdout is split locally into separate files.
	const markerStart = marker + 'START';
	const markerEnd = marker + 'END';
	const command = `bash -lc 'for log in ${quotedLogs}; do if [ -f "$log" ]; then echo "${markerStart} $log"; cat "$log"; echo "${markerEnd} $log"; fi; done'`;
	const result = runVagrantCapture(nodeName, command);

	if (!result.stdout) {
		return;
	}

	const lines = result.stdout.split('\n');
	const markerRegex = new RegExp(String.raw`^${marker}(START|END)\s+(.+)$`);

	let currentLog: string | null = null;
	let buffer: string[] = [];

	const flush = (): void => {
		if (!currentLog) {
			return;
		}
		const relativePath = currentLog.replace(/^\/+/, '');
		const localPath = join(outputDir, relativePath);
		mkdirSync(join(localPath, '..'), { recursive: true });
		writeFileSync(localPath, buffer.join('\n'), 'utf-8');
		buffer = [];
	};

	for (const line of lines) {
		const match = markerRegex.exec(line);
		if (match) {
			const [, kind, logPath] = match;
			if (kind === 'START') {
				flush();
				currentLog = logPath;
				buffer = [];
			} else if (kind === 'END' && currentLog === logPath) {
				flush();
				currentLog = null;
			}
			continue;
		}

		if (currentLog) {
			buffer.push(line);
		}
	}

	flush();
}

function runTestsInsideGuest(
	nodeName: string,
	coverage: boolean,
	debug: boolean,
): number {
	const testCommand = coverage
		? 'test:all:native:coverage'
		: 'test:all:native';
	const nodeFlags = debug ? '--inspect-brk=0.0.0.0:9230' : '';
	const command = debug
		? `bash -lc "set -o pipefail; cd /opt/openvidu-loadtest/browser-emulator && CI=true pnpm install >/var/log/pnpm_install.log 2>&1 && NODE_OPTIONS='${nodeFlags}' pnpm run ${testCommand} 2>&1 | tee /var/log/tests.log"`
		: `bash -lc "set -o pipefail; cd /opt/openvidu-loadtest/browser-emulator && CI=true pnpm install >/var/log/pnpm_install.log 2>&1 && pnpm run ${testCommand} 2>&1 | tee /var/log/tests.log"`;
	const result = runCommand('vagrant', ['ssh', nodeName, '-c', command], {
		allowFailure: true,
		capture: false,
	});
	return result.status ?? 1;
}

function destroyVM(machine: string): void {
	console.log(`Destroying VM ${machine}...`);
	runVagrant(machine, 'destroy', '-f');
}

function main(): void {
	const options = parseArgs(process.argv.slice(2));
	const nodeName = options.nodeName;

	console.log(
		`Vagrant Test runner: node=${nodeName}, livekit=${options.livekit}, timeout=${options.timeoutSeconds}s`,
	);

	handleVMState(nodeName);

	waitForPlatform(nodeName, options.livekit, options.timeoutSeconds);

	console.log('Running tests inside VM...');
	const exitCode = runTestsInsideGuest(
		nodeName,
		options.coverage,
		options.debug,
	);

	const artifactsDir = join(
		process.cwd(),
		'artifacts',
		'vagrant-tests',
		nowStamp(),
	);
	console.log(`Collecting guest logs to ${artifactsDir}`);
	collectGuestLogs(nodeName, artifactsDir);

	if (options.halt) {
		console.log(`Halting VM ${nodeName}...`);
		runVagrant(nodeName, 'halt');
	} else if (options.destroy) {
		destroyVM(nodeName);
	}

	if (exitCode !== 0) {
		console.error(`Tests failed with exit code ${exitCode}`);
		process.exit(exitCode);
	}

	console.log('Tests completed successfully.');
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
