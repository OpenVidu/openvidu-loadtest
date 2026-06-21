import { expect } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { OSUtils } from 'node-os-utils';
import baseLogger from '../../src/services/logger.service';
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
	creationLatencyMs: number | null;
	failed: boolean;
	failureReason?: string;
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

export interface BenchmarkResult {
	name: string;
	config: Record<string, unknown>;
	timeline: PhaseRecord[];
	creationLatencyMs: LatencyPercentiles;
	errors: number;
	totalDurationMs: number;
	cleanupDurationMs: number;
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

// --- Helpers ---

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
	await new Promise(resolve => setTimeout(resolve, 2000));
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

// --- Setup ---

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

// --- Saturation Loop ---

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
			await new Promise(resolve =>
				setTimeout(resolve, config.stabilizeMs),
			);
		}

		const metrics = await sampleMetrics();

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

// --- Benchmark ---

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
	const timeline: PhaseRecord[] = [];
	let totalPublishers = 0;
	let totalSubscribers = 0;
	let phaseIndex = 0;

	for (let s = 0; s < config.sessions; s++) {
		const sessionName =
			config.sessions > 1 ? `${sessionBase}-S${s + 1}` : sessionBase;

		for (let p = 1; p <= config.publishersPerSession; p++) {
			phaseIndex++;
			const result = await createParticipant(
				app,
				sessionName,
				`Pub-${p}`,
				'PUBLISHER',
			);
			totalPublishers++;
			if (result.status === 200) {
				latencies.push(result.latencyMs);
			}

			await new Promise(resolve => setTimeout(resolve, 500));

			const metrics = await sampleMetrics();
			timeline.push({
				phase: phaseIndex,
				totalParticipants: totalPublishers + totalSubscribers,
				totalPublishers,
				totalSubscribers,
				cpu: metrics.cpu,
				memoryRssMb: metrics.memoryRssMb,
				creationLatencyMs:
					result.status === 200 ? result.latencyMs : null,
				failed: result.status !== 200,
				failureReason:
					result.status !== 200
						? `${result.status} - ${JSON.stringify(result.body)}`
						: undefined,
			});
		}

		for (let c = 1; c <= config.subscribersPerSession; c++) {
			phaseIndex++;
			const result = await createParticipant(
				app,
				sessionName,
				`Sub-${c}`,
				'SUBSCRIBER',
			);
			totalSubscribers++;
			if (result.status === 200) {
				latencies.push(result.latencyMs);
			}

			await new Promise(resolve => setTimeout(resolve, 500));

			const metrics = await sampleMetrics();
			timeline.push({
				phase: phaseIndex,
				totalParticipants: totalPublishers + totalSubscribers,
				totalPublishers,
				totalSubscribers,
				cpu: metrics.cpu,
				memoryRssMb: metrics.memoryRssMb,
				creationLatencyMs:
					result.status === 200 ? result.latencyMs : null,
				failed: result.status !== 200,
				failureReason:
					result.status !== 200
						? `${result.status} - ${JSON.stringify(result.body)}`
						: undefined,
			});
		}
	}

	const cleanupDurationMs = await deleteAll(app);
	const errors = timeline.filter(p => p.failed).length;

	return {
		name,
		config,
		timeline,
		creationLatencyMs: computeLatencyPercentiles(latencies),
		errors,
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

	const filePath = path.join(PERF_RESULTS_DIR, `run-${runId}.json`);
	await fs.writeFile(filePath, JSON.stringify(output, null, 2));
	logger.info(`Performance results saved to ${filePath}`);
	return filePath;
}
