import { expect } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';

import { OSUtils } from 'node-os-utils';
import Docker from 'dockerode';
import baseLogger from '../../src/services/logger.service.js';
import { getConfig, checkDeploymentReachable } from '../utils/test-config.js';
import { pingInstance, initializeInstance } from '../e2e/e2e-test-utils.js';

const logger = baseLogger.child({ module: 'perf-test-utils' });

const osutils = new OSUtils();
export const PERF_RESULTS_DIR = path.join(
	process.cwd(),
	'stats',
	'perf-results',
);

// --- Types ---

export interface CreateParticipantResult {
	latencyMs: number;
	status: number;
	body: Record<string, unknown>;
	connectionId?: string;
}

export interface MetricsSnapshot {
	cpu: number;
	memoryRssMb: number;
	timestamp: string;
}

export interface PhaseRecord {
	phase: number;
	totalParticipants: number;
	totalPublishers: number;
	totalSubscribers: number;
	cpu: number | null;
	memoryRssMb: number | null;
	containers?: ContainerMetric[];
	containerGroups?: ContainerGroupSummary[];
	creationLatencyMs: number | null;
	failed: boolean;
	failureReason?: string;
	processProfiles?: ProcessProfile[];
	perfFiles?: PerfRecordFile[];
}

export interface ContainerMetric {
	name: string;
	group: 'browser-emulator' | 'lk' | 'local-deployment' | 'other';
	cpuPercent: number;
	memPercent: number;
	memUsageMb: number;
}

export interface ContainerGroupSummary {
	group: string;
	containerCount: number;
	totalCpuPercent: number;
	avgCpuPercent: number;
	totalMemUsageMb: number;
}

export interface SaturationCeiling {
	sustained100Participants: number | null;
	firstFailedParticipants: number | null;
	firstFailureReason: string | null;
}

export interface SaturationResult {
	name: string;
	topology: string;
	config: Record<string, unknown>;
	ceiling: SaturationCeiling;
	timeline: PhaseRecord[];
	totalDurationMs: number;
	cleanupDurationMs: number;
}

export interface LatencyPercentiles {
	p50: number;
	p95: number;
	p99: number;
	min: number;
	max: number;
	avg: number;
}

export interface ProcessProfile {
	pid: number;
	role: 'publisher' | 'subscriber';
	cpuPct: number | null;
	voluntaryCtxSw: number | null;
	nonvoluntaryCtxSw: number | null;
}

export interface PerfRecordFile {
	phase: number;
	role: 'publisher' | 'subscriber';
	pid: number;
	filePath: string;
}

export interface BenchmarkResult {
	name: string;
	config: Record<string, unknown>;
	timeline: PhaseRecord[];
	creationLatencyMs: LatencyPercentiles;
	errors: number;
	totalDurationMs: number;
	cleanupDurationMs: number;
	launcherMode: 'docker' | 'direct';
}

export interface StepAction {
	sessionName: string;
	userId: string;
	role: 'PUBLISHER' | 'SUBSCRIBER';
}

export interface SaturationConfig {
	topology: string;
	description: string;
	maxDurationMs: number;
	stabilizeMs: number;
	cpuSustainedThreshold: number;
	consecutiveSustainedRequired: number;
}

export const DEFAULT_SATURATION_CONFIG: SaturationConfig = {
	topology: 'unknown',
	description: '',
	maxDurationMs: 600000,
	stabilizeMs: 500,
	cpuSustainedThreshold: 99,
	consecutiveSustainedRequired: 3,
};

// --- Procfs Profiling Types ---

interface LkProcess {
	pid: number;
	identity: string;
	role: 'publisher' | 'subscriber';
}

interface ProcCpuTicks {
	utime: number;
	stime: number;
}

interface ProcCtxSwitches {
	voluntary: number;
	nonvoluntary: number;
}

interface ProcSnapshot {
	cpu: ProcCpuTicks | null;
	ctxSw: ProcCtxSwitches | null;
}

// --- Helpers ---

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function ensureResultsDir(): Promise<void> {
	await fs.mkdir(PERF_RESULTS_DIR, { recursive: true });
}

export async function sampleCpu(): Promise<number> {
	const usage = await osutils.cpu.usage();
	if (usage.success) return usage.data;
	return 0;
}

export async function sampleMetrics(): Promise<MetricsSnapshot> {
	const [cpu] = await Promise.all([sampleCpu()]);
	const memUsage = process.memoryUsage();
	return {
		cpu,
		memoryRssMb: Math.round((memUsage.rss / (1024 * 1024)) * 100) / 100,
		timestamp: new Date().toISOString(),
	};
}

// --- Container Monitoring ---

const docker = new Docker();

function classifyContainer(
	name: string,
	labels: Record<string, string>,
): ContainerMetric['group'] {
	if (name === 'browser-emulator-tests') return 'browser-emulator';
	if (name.startsWith('lk-')) return 'lk';
	if (labels['com.docker.compose.project'] === 'openvidu-local-deployment') {
		return 'local-deployment';
	}
	return 'other';
}

export async function sampleContainerMetrics(): Promise<{
	containers: ContainerMetric[];
	groups: ContainerGroupSummary[];
}> {
	try {
		const containerList = await docker.listContainers();
		if (containerList.length === 0) {
			return { containers: [], groups: [] };
		}

		const results = await Promise.allSettled(
			containerList.map(async info => {
				const name = (info.Names?.[0] ?? '').replace(/^\//, '');
				if (!name) return null;

				const container = docker.getContainer(info.Id);
				const stats = (await container.stats({
					stream: false,
				})) as {
					cpu_stats: {
						cpu_usage: { total_usage: number };
						system_cpu_usage: number;
						online_cpus: number;
					};
					precpu_stats: {
						cpu_usage: { total_usage: number };
						system_cpu_usage: number;
					};
					memory_stats: {
						usage: number;
						limit: number;
					};
				};

				const cpuDelta =
					stats.cpu_stats.cpu_usage.total_usage -
					stats.precpu_stats.cpu_usage.total_usage;
				const systemDelta =
					stats.cpu_stats.system_cpu_usage -
					stats.precpu_stats.system_cpu_usage;
				const cpuPercent =
					systemDelta > 0
						? Math.round(
								(cpuDelta / systemDelta) *
									100 *
									(stats.cpu_stats.online_cpus ?? 1) *
									100,
							) / 100
						: 0;

				const memUsageMb =
					Math.round(
						((stats.memory_stats.usage ?? 0) / (1024 * 1024)) * 100,
					) / 100;
				const memLimitMb =
					Math.round(
						((stats.memory_stats.limit ?? 0) / (1024 * 1024)) * 100,
					) / 100;
				const memPercent =
					memLimitMb > 0
						? Math.round((memUsageMb / memLimitMb) * 100 * 100) /
							100
						: 0;

				const group = classifyContainer(name, info.Labels ?? {});

				return {
					name,
					group,
					cpuPercent,
					memPercent,
					memUsageMb,
				} satisfies ContainerMetric;
			}),
		);

		const containers: ContainerMetric[] = [];
		const groupAgg = new Map<
			string,
			{
				count: number;
				totalCpu: number;
				totalMemMb: number;
			}
		>();

		for (const result of results) {
			if (result.status === 'fulfilled' && result.value) {
				const c = result.value;
				containers.push(c);

				const agg = groupAgg.get(c.group) ?? {
					count: 0,
					totalCpu: 0,
					totalMemMb: 0,
				};
				agg.count++;
				agg.totalCpu += c.cpuPercent;
				agg.totalMemMb += c.memUsageMb;
				groupAgg.set(c.group, agg);
			}
		}

		const groups: ContainerGroupSummary[] = [];
		for (const [group, agg] of groupAgg) {
			groups.push({
				group,
				containerCount: agg.count,
				totalCpuPercent: Math.round(agg.totalCpu * 100) / 100,
				avgCpuPercent:
					Math.round((agg.totalCpu / agg.count) * 100) / 100,
				totalMemUsageMb: Math.round(agg.totalMemMb * 100) / 100,
			});
		}

		return { containers, groups };
	} catch (error) {
		logger.warn('Failed to sample container metrics: %s', String(error));
		return { containers: [], groups: [] };
	}
}

export async function createParticipant(
	app: Application,
	sessionName: string,
	userId: string,
	role: 'PUBLISHER' | 'SUBSCRIBER',
	platform: 'openvidu' | 'livekit' = 'livekit',
): Promise<CreateParticipantResult> {
	const config = getConfig();
	const startTime = performance.now();

	const body: Record<string, unknown> = {
		properties: {
			userId,
			sessionName,
			role,
			audio: role === 'PUBLISHER',
			video: role === 'PUBLISHER',
			resolution: '640x480',
			framerate: 30,
			showVideoElements: false,
			browser: 'emulated',
		},
	};

	if (platform === 'livekit') {
		body.openviduUrl = config.livekitUrl;
		body.livekitApiKey = config.livekitApiKey;
		body.livekitApiSecret = config.livekitApiSecret;
	} else {
		body.openviduUrl = config.openviduUrl;
		body.openviduSecret = config.openviduSecret;
	}

	try {
		const response = await request(app)
			.post('/openvidu-browser/streamManager')
			.send(body)
			.timeout(30000);

		const latencyMs = Math.round(performance.now() - startTime);

		return {
			latencyMs,
			status: response.status,
			body: response.body as Record<string, unknown>,
			connectionId:
				response.status === 200
					? ((response.body as Record<string, unknown>)
							.connectionId as string)
					: undefined,
		};
	} catch (error: unknown) {
		const latencyMs = Math.round(performance.now() - startTime);
		return {
			latencyMs,
			status: 0,
			body: { error: String(error) },
		};
	}
}

export async function deleteAll(app: Application): Promise<number> {
	const startTime = performance.now();
	const response = await request(app).delete(
		'/openvidu-browser/streamManager',
	);
	expect(response.status).toBe(200);
	await sleep(2000);
	return Math.round(performance.now() - startTime);
}

export function computeLatencyPercentiles(
	samples: number[],
): LatencyPercentiles {
	if (samples.length === 0) {
		return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const sum = sorted.reduce((a, b) => a + b, 0);
	return {
		p50: sorted[Math.max(0, Math.floor(sorted.length * 0.5) - 1)],
		p95: sorted[Math.max(0, Math.floor(sorted.length * 0.95) - 1)],
		p99: sorted[Math.max(0, Math.floor(sorted.length * 0.99) - 1)],
		min: sorted[0],
		max: sorted[sorted.length - 1],
		avg: Math.round((sum / sorted.length) * 100) / 100,
	};
}

export async function setupPerformanceTest(
	app: Application,
	platform: 'openvidu' | 'livekit' = 'livekit',
): Promise<{ beforeMetrics: MetricsSnapshot }> {
	await pingInstance(app);
	const config = getConfig();
	const deployUrl =
		platform === 'livekit' ? config.livekitUrl : config.openviduUrl;
	await checkDeploymentReachable(deployUrl);
	await initializeInstance(app);
	const beforeMetrics = await sampleMetrics();
	return { beforeMetrics };
}

// --- Procfs Profiling Helpers ---

export async function findLkPids(sessionNames: string[]): Promise<LkProcess[]> {
	const results: LkProcess[] = [];

	try {
		const procEntries = await fs.readdir('/proc');
		const pidDirs = procEntries.filter(e => /^\d+$/.test(e)).map(Number);

		for (const pid of pidDirs) {
			try {
				const cmdlinePath = `/proc/${pid}/cmdline`;
				const cmdlineBuf = await fs.readFile(cmdlinePath);
				const cmdline = cmdlineBuf.toString('utf8').replace(/\0/g, ' ');

				if (
					!cmdline.includes('lk room join') &&
					!cmdline.includes('livekit-cli room join')
				)
					continue;

				const matchesSession = sessionNames.some(name =>
					cmdline.includes(name),
				);
				if (!matchesSession) continue;

				const identityMatch = /--identity\s+(\S+)/.exec(cmdline);
				const identity = identityMatch
					? identityMatch[1]
					: `unknown-${pid}`;

				const role = cmdline.includes('--publish')
					? ('publisher' as const)
					: ('subscriber' as const);

				results.push({ pid, identity, role });
			} catch {
				// Process exited between listing and reading
			}
		}
	} catch {
		logger.warn('/proc not accessible for PID scanning');
	}

	logger.info(
		{
			pids: results.map(p => ({
				pid: p.pid,
				identity: p.identity,
				role: p.role,
			})),
		},
		'Found lk processes',
	);
	return results;
}

export function readProcCpuTicks(pid: number): ProcCpuTicks | null {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
		const parts = stat.split(' ');
		return {
			utime: parseInt(parts[13], 10),
			stime: parseInt(parts[14], 10),
		};
	} catch {
		return null;
	}
}

export function readProcCtxSwitches(pid: number): ProcCtxSwitches | null {
	try {
		const status = readFileSync(`/proc/${pid}/status`, 'utf8');
		const vMatch = /voluntary_ctxt_switches:\s+(\d+)/.exec(status);
		const nvMatch = /nonvoluntary_ctxt_switches:\s+(\d+)/.exec(status);
		if (!vMatch || !nvMatch) return null;
		return {
			voluntary: parseInt(vMatch[1], 10),
			nonvoluntary: parseInt(nvMatch[1], 10),
		};
	} catch {
		return null;
	}
}

export function snapshotProc(pid: number): ProcSnapshot {
	return {
		cpu: readProcCpuTicks(pid),
		ctxSw: readProcCtxSwitches(pid),
	};
}

export function snapshotProcfsMap(pids: number[]): Map<number, ProcSnapshot> {
	const map = new Map<number, ProcSnapshot>();
	for (const pid of pids) {
		const snap = snapshotProc(pid);
		if (snap.cpu || snap.ctxSw) {
			map.set(pid, snap);
		}
	}
	return map;
}

export function calcProcDelta(
	before: Map<number, ProcSnapshot>,
	after: Map<number, ProcSnapshot>,
	elapsedSec: number,
	pidRoleMap: Map<number, string>,
): ProcessProfile[] {
	const profiles: ProcessProfile[] = [];
	const clkTck = 100;

	for (const [pid, afterSnap] of after) {
		const beforeSnap = before.get(pid);
		if (!beforeSnap || !afterSnap.cpu || !beforeSnap.cpu) continue;

		const utimeDelta = afterSnap.cpu.utime - beforeSnap.cpu.utime;
		const stimeDelta = afterSnap.cpu.stime - beforeSnap.cpu.stime;
		const totalDelta = utimeDelta + stimeDelta;
		const cpuPct =
			elapsedSec > 0 ? (totalDelta / clkTck / elapsedSec) * 100 : null;

		let voluntaryCtxSw: number | null = null;
		let nonvoluntaryCtxSw: number | null = null;
		if (beforeSnap.ctxSw && afterSnap.ctxSw) {
			voluntaryCtxSw =
				afterSnap.ctxSw.voluntary - beforeSnap.ctxSw.voluntary;
			nonvoluntaryCtxSw =
				afterSnap.ctxSw.nonvoluntary - beforeSnap.ctxSw.nonvoluntary;
		}

		profiles.push({
			pid,
			role:
				(pidRoleMap.get(pid) as 'publisher' | 'subscriber') ??
				'publisher',
			cpuPct: cpuPct !== null ? Math.round(cpuPct * 10) / 10 : null,
			voluntaryCtxSw,
			nonvoluntaryCtxSw,
		});
	}

	return profiles;
}

/**
 * Extract the lk binary from the lk-profiling Docker image and register it
 * in perf's buildid-cache so that cross-container perf.data files can
 * resolve Go function names (build IDs may differ between test & profiling images).
 */
function ensureBuildIdCache(): void {
	try {
		const tmpDir = '/tmp/lk-perf-buildid';
		execSync(`mkdir -p ${tmpDir}`, { stdio: 'ignore' });
		// Extract lk binary from profiling image (entrypoint override needed because
		// Dockerfile.lk-profiling sets ENTRYPOINT ["lk"])
		execSync(
			`id=$(docker create --entrypoint sh lk-profiling:latest 2>/dev/null) && ` +
				`docker cp $id:/usr/local/bin/lk ${tmpDir}/lk 2>/dev/null && ` +
				`docker rm $id >/dev/null 2>&1; ` +
				`perf buildid-cache -a ${tmpDir}/lk 2>/dev/null`,
			{ stdio: 'ignore', shell: true },
		);
	} catch {
		// non-fatal; symbols may be unresolved in docker mode
	}
}

export async function runPerfRecord(
	pids: number[],
	outfile: string,
	durationMs: number,
): Promise<boolean> {
	return new Promise(resolve => {
		const durationSec = Math.ceil(durationMs / 1000);
		const pidList = pids.join(',');
		const proc = spawn(
			'perf',
			[
				'record',
				'-g',
				'-p',
				pidList,
				'-o',
				outfile,
				'--',
				'sleep',
				String(durationSec),
			],
			{
				stdio: ['ignore', 'ignore', 'pipe'],
			},
		);

		let stderr = '';
		proc.stderr?.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on('exit', code => {
			if (code !== 0) {
				logger.warn(
					{ exitCode: code, stderr },
					'perf record exited with non-zero',
				);
			}
			resolve(code === 0);
		});
		proc.on('error', err => {
			logger.warn({ error: err.message }, 'perf record failed to start');
			resolve(false);
		});
	});
}

function extractIndex(identity: string): number {
	const match = /-(\d+)$/.exec(identity);
	return match ? parseInt(match[1], 10) : 0;
}

function pickQuarterEnds<T>(items: T[]): T[] {
	if (items.length === 0) return [];
	const q = Math.max(1, Math.ceil(items.length / 4));
	if (q * 2 >= items.length) return [...items];
	return [...items.slice(0, q), ...items.slice(-q)];
}

export function selectPerfTargets(
	processes: LkProcess[],
	totalConfiguredPublishers: number,
	totalConfiguredSubscribers: number,
): number[] {
	const publishers = processes
		.filter(p => p.role === 'publisher')
		.sort((a, b) => extractIndex(a.identity) - extractIndex(b.identity));
	const subscribers = processes
		.filter(p => p.role === 'subscriber')
		.sort((a, b) => extractIndex(a.identity) - extractIndex(b.identity));

	const totalConfigured =
		totalConfiguredPublishers + totalConfiguredSubscribers;

	const pubCandidates = pickQuarterEnds(publishers);
	const subCandidates = pickQuarterEnds(subscribers);

	if (totalConfigured <= 10) {
		return [
			...pubCandidates.map(p => p.pid),
			...subCandidates.map(p => p.pid),
		];
	}

	const maxPub = Math.min(1, pubCandidates.length);
	const maxSub = Math.min(4, subCandidates.length);
	const selectedPubs = pubCandidates.slice(0, maxPub);
	const selectedSubs = subCandidates.slice(0, maxSub);

	return [...selectedPubs.map(p => p.pid), ...selectedSubs.map(p => p.pid)];
}

// --- Benchmark (parallel creation with profiling) ---

export async function runBenchmark(
	app: Application,
	name: string,
	config: {
		topology: string;
		sessions: number;
		publishersPerSession: number;
		subscribersPerSession: number;
	},
): Promise<BenchmarkResult> {
	const startTime = Date.now();
	const sessionBase = `Perf-${name}-${Date.now()}`;
	const latencies: number[] = [];

	const sessionNames: string[] = [];
	for (let s = 0; s < config.sessions; s++) {
		const sessionName =
			config.sessions > 1 ? `${sessionBase}-S${s + 1}` : sessionBase;
		sessionNames.push(sessionName);
	}

	const totalPublishers = config.sessions * config.publishersPerSession;
	const totalSubscribers = config.sessions * config.subscribersPerSession;
	const totalParticipants = totalPublishers + totalSubscribers;

	// Phase 1: Create all publishers in parallel
	let pubFailed = 0;
	if (totalPublishers > 0) {
		const pubPromises: Promise<CreateParticipantResult>[] = [];
		for (const sessionName of sessionNames) {
			for (let p = 1; p <= config.publishersPerSession; p++) {
				pubPromises.push(
					createParticipant(
						app,
						sessionName,
						`Pub-${p}`,
						'PUBLISHER',
					).then(result => {
						if (result.status === 200) {
							latencies.push(result.latencyMs);
						} else {
							pubFailed++;
						}
						return result;
					}),
				);
			}
		}
		await Promise.all(pubPromises);
		logger.info(
			{ totalPublishers, failed: pubFailed },
			'All publishers created',
		);
	}

	// Phase 2: Create all subscribers in parallel
	let subFailed = 0;
	if (totalSubscribers > 0) {
		const subPromises: Promise<CreateParticipantResult>[] = [];
		for (const sessionName of sessionNames) {
			for (let c = 1; c <= config.subscribersPerSession; c++) {
				subPromises.push(
					createParticipant(
						app,
						sessionName,
						`Sub-${c}`,
						'SUBSCRIBER',
					).then(result => {
						if (result.status === 200) {
							latencies.push(result.latencyMs);
						} else {
							subFailed++;
						}
						return result;
					}),
				);
			}
		}
		await Promise.all(subPromises);
		logger.info(
			{ totalSubscribers, failed: subFailed },
			'All subscribers created',
		);
	}

	// Phase 3: Steady state wait
	const steadyWaitMs = Number(process.env.PROFILER_STEADY_WAIT_MS ?? '3000');
	await sleep(steadyWaitMs);

	// Phase 4: Find lk PIDs
	const lkProcesses = await findLkPids(sessionNames);

	// Phase 5: Profile
	const profiles: ProcessProfile[] = [];
	const perfFiles: PerfRecordFile[] = [];
	const profilingDurationMs = Number(
		process.env.PROFILER_DURATION_MS ?? '15000',
	);

	if (lkProcesses.length > 0) {
		const allPids = lkProcesses.map(p => p.pid);
		const pidRoleMap = new Map<number, string>(
			lkProcesses.map(p => [p.pid, p.role]),
		);

		// Select perf targets
		const perfTargetPids = selectPerfTargets(
			lkProcesses,
			totalPublishers,
			totalSubscribers,
		);

		// Before snapshot
		const beforeMap = snapshotProcfsMap(allPids);

		// Run perf record (single instance for all targets)
		if (perfTargetPids.length > 0) {
			// Register lk binary from profiling image in perf buildid-cache so
			// cross-container perf.data resolves Go function names
			ensureBuildIdCache();
			const runId = new Date().toISOString().replace(/[:.]/g, '-');
			const suffix = process.env.PERF_RESULTS_SUFFIX ?? '';
			const outfile = path.join(
				PERF_RESULTS_DIR,
				`perf-${name}-${runId}${suffix ? `-${suffix}` : ''}.data`,
			);
			await ensureResultsDir();
			const ok = await runPerfRecord(
				perfTargetPids,
				outfile,
				profilingDurationMs,
			);

			if (ok) {
				perfFiles.push({
					phase: 1,
					role:
						lkProcesses.find(p => perfTargetPids.includes(p.pid))
							?.role ?? 'publisher',
					pid: perfTargetPids[0],
					filePath: outfile,
				});
			}
		} else {
			await sleep(profilingDurationMs);
		}

		// After snapshot
		const afterMap = snapshotProcfsMap(allPids);

		// Compute deltas
		profiles.push(
			...calcProcDelta(
				beforeMap,
				afterMap,
				profilingDurationMs / 1000,
				pidRoleMap,
			),
		);
	} else {
		logger.warn('No lk processes found, skipping procfs profiling');
		await sleep(profilingDurationMs);
	}

	// System metrics snapshot
	const [metrics, containerStats] = await Promise.all([
		sampleMetrics(),
		sampleContainerMetrics(),
	]);

	const totalErrors = pubFailed + subFailed;

	const timeline: PhaseRecord[] = [
		{
			phase: 1,
			totalParticipants,
			totalPublishers,
			totalSubscribers,
			cpu: metrics.cpu,
			memoryRssMb: metrics.memoryRssMb,
			containers: containerStats.containers,
			containerGroups: containerStats.groups,
			processProfiles: profiles.length > 0 ? profiles : undefined,
			perfFiles: perfFiles.length > 0 ? perfFiles : undefined,
			creationLatencyMs: null,
			failed: totalErrors > 0,
			failureReason:
				totalErrors > 0
					? `${totalErrors} participants failed`
					: undefined,
		},
	];

	// Cleanup
	const cleanupDurationMs = await deleteAll(app);

	const launcherMode =
		process.env.EMULATED_LAUNCHER_MODE === 'direct' ? 'direct' : 'docker';

	return {
		name,
		config,
		timeline,
		creationLatencyMs: computeLatencyPercentiles(latencies),
		errors: totalErrors,
		totalDurationMs: Date.now() - startTime,
		cleanupDurationMs,
		launcherMode,
	};
}

// --- Saturation Loop (unchanged) ---

export type SaturationStepFn = (
	stepIndex: number,
	currentPublishers: number,
	currentSubscribers: number,
) => StepAction | null;

export async function runSaturation(
	app: Application,
	stepFn: SaturationStepFn,
	config: SaturationConfig,
): Promise<SaturationResult> {
	const startTime = Date.now();
	const timeline: PhaseRecord[] = [];

	let totalPublishers = 0;
	let totalSubscribers = 0;
	let sustainedCount = 0;

	let sustained100Participants: number | null = null;
	let firstFailedParticipants: number | null = null;
	let firstFailureReason: string | null = null;
	let phaseIndex = 0;

	while (true) {
		const elapsed = Date.now() - startTime;
		if (elapsed > config.maxDurationMs) {
			logger.info(`Saturation test timed out after ${elapsed}ms`);
			break;
		}

		const action = stepFn(phaseIndex, totalPublishers, totalSubscribers);
		if (action === null) {
			logger.info('Step function returned null, stopping');
			break;
		}

		phaseIndex++;

		const result = await createParticipant(
			app,
			action.sessionName,
			action.userId,
			action.role,
		);

		if (action.role === 'PUBLISHER') {
			totalPublishers++;
		} else {
			totalSubscribers++;
		}
		const totalParticipants = totalPublishers + totalSubscribers;

		const failed = result.status !== 200;
		if (failed && firstFailedParticipants === null) {
			firstFailedParticipants = totalParticipants;
			firstFailureReason = `${result.status} - ${JSON.stringify(result.body)}`;
		}

		if (config.stabilizeMs > 0) {
			await sleep(config.stabilizeMs);
		}

		const [metrics, containerStats] = await Promise.all([
			sampleMetrics(),
			sampleContainerMetrics(),
		]);

		if (metrics.cpu >= config.cpuSustainedThreshold) {
			sustainedCount++;
			if (
				sustainedCount >= config.consecutiveSustainedRequired &&
				sustained100Participants === null
			) {
				sustained100Participants = totalParticipants;
			}
		} else {
			sustainedCount = Math.max(0, sustainedCount - 1);
		}

		timeline.push({
			phase: phaseIndex,
			totalParticipants,
			totalPublishers,
			totalSubscribers,
			cpu: metrics.cpu,
			memoryRssMb: metrics.memoryRssMb,
			containers: containerStats.containers,
			containerGroups: containerStats.groups,
			creationLatencyMs: result.status === 200 ? result.latencyMs : null,
			failed,
			failureReason: failed
				? (firstFailureReason ?? undefined)
				: undefined,
		});

		if (sustained100Participants !== null || failed) {
			logger.info(
				`Saturation ceiling reached: ${failed ? 'participant failure' : 'CPU sustained'} at ${totalParticipants} participants`,
			);
			break;
		}
	}

	logger.info('Cleaning up saturation test...');
	const cleanupDurationMs = await deleteAll(app);

	return {
		name: config.topology,
		topology: config.topology,
		config: { ...config },
		ceiling: {
			sustained100Participants,
			firstFailedParticipants,
			firstFailureReason,
		},
		timeline,
		totalDurationMs: Date.now() - startTime,
		cleanupDurationMs,
	};
}

// --- Result Serialization ---

export interface PerfRunOutput {
	runId: string;
	timestamp: string;
	system: {
		nodeVersion: string;
		platform: string;
		arch: string;
		cpus: number;
		totalMemoryGb: number;
	};
	results: (BenchmarkResult | SaturationResult)[];
}

export async function saveRunResults(
	runId: string,
	results: (BenchmarkResult | SaturationResult)[],
): Promise<string> {
	const output: PerfRunOutput = {
		runId,
		timestamp: new Date().toISOString(),
		system: {
			nodeVersion: process.version,
			platform: process.platform,
			arch: process.arch,
			cpus: os.cpus().length,
			totalMemoryGb:
				Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 100) / 100,
		},
		results,
	};

	const suffix = process.env.PERF_RESULTS_SUFFIX ?? '';
	const filePath = path.join(
		PERF_RESULTS_DIR,
		`run-${runId}${suffix ? `-${suffix}` : ''}.json`,
	);
	await fs.writeFile(filePath, JSON.stringify(output, null, 2));
	logger.info(`Performance results saved to ${filePath}`);
	return filePath;
}
