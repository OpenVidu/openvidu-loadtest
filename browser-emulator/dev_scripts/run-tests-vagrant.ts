#!/usr/bin/env node

import {
	mkdirSync,
	writeFileSync,
	readFileSync,
	openSync,
	closeSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

interface RunOptions {
	livekit: boolean;
	nodeName: string;
	timeoutSeconds: number;
	project: string | null;
	halt: boolean;
	destroy: boolean;
	coverage: boolean;
	debug: boolean;
}

type BooleanOptionKey = 'livekit' | 'coverage' | 'debug' | 'halt' | 'destroy';

const DEFAULT_OPTIONS: RunOptions = {
	livekit: false,
	nodeName: 'node1',
	timeoutSeconds: 600,
	project: null,
	halt: false,
	destroy: false,
	coverage: false,
	debug: false,
};

const BOOLEAN_FLAGS: Record<string, BooleanOptionKey> = {
	'--livekit': 'livekit',
	'--coverage': 'coverage',
	'--debug': 'debug',
	'--halt': 'halt',
	'--destroy': 'destroy',
};

const GUEST_LOG_DIRS = [
	'/opt/openvidu-loadtest/browser-emulator/logs/',
	'/var/log/',
];

function vagrantSshArgs(machine: string, command: string): string[] {
	return ['ssh', machine, '-c', command];
}

function ensureParentDir(filePath: string): void {
	mkdirSync(join(filePath, '..'), { recursive: true });
}

function printUsage(): void {
	console.log(`Usage: pnpm run test:all -- [options]

Options:
  --livekit           Wait for LiveKit readiness (default: wait for OpenVidu)
  --node=<name>       Vagrant machine name (default: node1)
  --timeout=<secs>    Readiness timeout in seconds (default: 600, 10 minutes)
  --project=<name>    Run only one Vitest project (for example: unit, e2e)
  --coverage          Run tests with coverage
  --debug             Enable Node debugger (port 9230 forwarded to host)
  --halt              Halt VM after successful execution (vagrant halt)
  --destroy           Destroy VM after successful execution (vagrant destroy -f)
  --help              Show this help

Examples:
  # Run all tests on OpenVidu 2
  pnpm run test:all
  # Run only e2e tests on LiveKit with coverage
  pnpm run test:all -- --livekit --project=e2e --coverage
  # Run integration-native tests with debugger enabled (Recommended: Use the VSCode launch configuration instead for easier use)
  pnpm run test:all -- --project=integration-native --debug
`);
}

function parseArgs(argv: string[]): RunOptions {
	const options: RunOptions = { ...DEFAULT_OPTIONS };

	for (const arg of argv) {
		const booleanFlag = BOOLEAN_FLAGS[arg];
		if (booleanFlag) {
			options[booleanFlag] = true;
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
		} else if (arg.startsWith('--project=')) {
			const project = arg.slice('--project='.length).trim();
			if (!project) {
				throw new Error('Project name cannot be empty.');
			}
			options.project = project;
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
	return runCommand('vagrant', vagrantSshArgs(machine, command), {
		capture: true,
		allowFailure: true,
	});
}

function runVagrantToFile(
	machine: string,
	command: string,
	outputFile: string,
): number {
	const outputFd = openSync(outputFile, 'w');
	try {
		const result = spawnSync('vagrant', vagrantSshArgs(machine, command), {
			stdio: ['ignore', outputFd, 'inherit'],
			shell: false,
		});

		if (result.error) {
			throw result.error;
		}

		return result.status ?? 1;
	} finally {
		closeSync(outputFd);
	}
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
	ensureParentDir(cacheFile);
	writeFileSync(cacheFile, hash, 'utf-8');
}

function parseProvisionFilesFromVagrantfile(): string[] {
	try {
		const vagrantfileContent = readFileSync('Vagrantfile', 'utf-8');
		const files: string[] = [];

		// Extract files_to_provision array
		const arrayMatch = /files_to_provision\s*=\s*\[([\s\S]*?)\]/.exec(
			vagrantfileContent,
		);
		if (!arrayMatch) {
			throw new Error(
				'Could not find files_to_provision array in Vagrantfile',
			);
		}

		const arrayContent = arrayMatch[1];
		// Extract each file path (the part before ':')
		const fileMatches = arrayContent.matchAll(/["']([^"':]+)\s*:/g);

		for (const match of fileMatches) {
			const filePath = match[1];
			files.push(filePath);
		}

		// Add other files that affect provisioning
		files.push('Vagrantfile', 'vagrant_setup_start.sh');

		return files;
	} catch (error) {
		console.warn(
			`Unable to parse Vagrantfile: ${error instanceof Error ? error.message : 'Unknown error'}. Falling back to default list.`,
		);
		return [
			'Vagrantfile',
			'vagrant_setup_start.sh',
			'package.json',
			'pnpm-lock.yaml',
		];
	}
}

function shouldProvision(machine: string): boolean {
	const provisionFiles = parseProvisionFilesFromVagrantfile();

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
		? 'curl http://localhost:7880'
		: `curl -k -H 'Authorization: Basic ${Buffer.from('OPENVIDUAPP:vagrant').toString('base64')}' https://localhost/openvidu/api/sessions >/dev/null`;

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

	const escapedSingleQuote = String.raw`'\''`;
	const quotedDirs = GUEST_LOG_DIRS.map(dir => `"${dir}"`).join(' ');
	const listCommand = `bash -lc 'for dir in ${quotedDirs}; do if [ -d "$dir" ]; then find "$dir" -type f -name "*.log" -readable; fi; done | sort -u'`;
	const listResult = runVagrantCapture(nodeName, listCommand);

	if ((listResult.status ?? 1) !== 0) {
		console.warn(
			'Could not list guest log files. Log collection will be skipped.',
		);
		return;
	}

	const guestLogPaths = (listResult.stdout ?? '')
		.split('\n')
		.map(path => path.trim())
		.filter(Boolean);

	for (const guestLogPath of guestLogPaths) {
		const relativePath = guestLogPath.replace(/^\/+/, '');
		const localPath = join(outputDir, relativePath);
		ensureParentDir(localPath);

		const quotedLogPath = `'${guestLogPath.replaceAll("'", escapedSingleQuote)}'`;
		const command = `bash -lc "if [ -f ${quotedLogPath} ]; then cat ${quotedLogPath}; fi"`;
		const status = runVagrantToFile(nodeName, command, localPath);
		if (status !== 0) {
			console.warn(
				`Could not collect guest log ${guestLogPath} (exit code ${status}).`,
			);
		}
	}
}

function runTestsInsideGuest(
	nodeName: string,
	coverage: boolean,
	debug: boolean,
	project: string | null,
): number {
	let testCommand = 'pnpm exec vitest run';
	if (coverage) {
		testCommand += ' --coverage';
	}
	if (debug) {
		testCommand +=
			' --inspect-brk=0.0.0.0:9230 --no-file-parallelism --test-timeout=0';
	}
	if (project) {
		testCommand += ` --project=${project}`;
	}
	console.log(`Running test command inside guest: ${testCommand}`);

	const command = `bash -lc "set -o pipefail; cd /opt/openvidu-loadtest/browser-emulator && CI=true pnpm install >/var/log/pnpm_install.log 2>&1 && ${testCommand} 2>&1 | tee /var/log/tests.log"`;
	const result = runCommand('vagrant', vagrantSshArgs(nodeName, command), {
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

	printOptions(options);

	handleVMState(nodeName);

	waitForPlatform(nodeName, options.livekit, options.timeoutSeconds);

	console.log('Running tests inside VM...');
	const exitCode = runTestsInsideGuest(
		nodeName,
		options.coverage,
		options.debug,
		options.project,
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
function printOptions(options: RunOptions) {
	const lines = [
		`  Node: ${options.nodeName}`,
		`  Platform: ${options.livekit ? 'LiveKit' : 'OpenVidu'}`,
		`  Timeout: ${options.timeoutSeconds} seconds`,
		`  Vitest project: ${options.project ?? 'all projects'}`,
		`  Coverage: ${options.coverage ? 'enabled' : 'disabled'}`,
		`  Debug: ${options.debug ? 'enabled' : 'disabled'}`,
		`  Halt after tests: ${options.halt ? 'yes' : 'no'}`,
		`  Destroy after tests: ${options.destroy ? 'yes' : 'no'}`,
	];

	console.log('Running with options:');
	for (const line of lines) {
		console.log(line);
	}
}
