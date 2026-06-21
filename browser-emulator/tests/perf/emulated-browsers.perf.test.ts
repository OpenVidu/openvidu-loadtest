import { describe, it, beforeEach, afterEach, afterAll } from 'vitest';
import { startServer } from '../../src/app.js';
import type { Application } from 'express';
import { setupServerPorts, cleanupServer } from '../e2e/e2e-test-utils.js';
import {
	ensureResultsDir,
	setupPerformanceTest,
	countAllErrors,
	runBenchmark,
	runSaturation,
	DEFAULT_SATURATION_CONFIG,
	type SaturationStepFn,
	type BenchmarkResult,
	type SaturationResult,
	saveRunResults,
} from './perf-test-utils.js';

let app: Application;
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const ALL_RESULTS: (BenchmarkResult | SaturationResult)[] = [];

beforeEach(async () => {
	await setupServerPorts();
	process.env.COM_MODULE = 'livekit';
	({ app } = await startServer());
}, 30000);

afterEach(async () => {
	await cleanupServer();
}, 30000);

afterAll(async () => {
	await ensureResultsDir();
	await saveRunResults(RUN_ID, ALL_RESULTS);
});

describe('Perf: emulated browsers', () => {
	describe('Benchmarks', () => {
		it('bench-one-room-publishers', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const result = await runBenchmark(
				app,
				'bench-one-room-publishers',
				{
					topology: 'ONE_SESSION_NXN',
					sessions: 1,
					publishersPerSession: 8,
					subscribersPerSession: 0,
				},
				beforeMetrics,
			);
			ALL_RESULTS.push(result);
		});

		it('bench-one-room-mixed', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const result = await runBenchmark(
				app,
				'bench-one-room-mixed',
				{
					topology: 'ONE_SESSION_NXM',
					sessions: 1,
					publishersPerSession: 1,
					subscribersPerSession: 20,
				},
				beforeMetrics,
			);
			ALL_RESULTS.push(result);
		});

		it('bench-multi-room-publishers', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const result = await runBenchmark(
				app,
				'bench-multi-room-publishers',
				{
					topology: 'N:N',
					sessions: 5,
					publishersPerSession: 8,
					subscribersPerSession: 0,
				},
				beforeMetrics,
			);
			ALL_RESULTS.push(result);
		});

		it('bench-multi-room-mixed', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const result = await runBenchmark(
				app,
				'bench-multi-room-mixed',
				{
					topology: 'N:M',
					sessions: 2,
					publishersPerSession: 3,
					subscribersPerSession: 40,
				},
				beforeMetrics,
			);
			ALL_RESULTS.push(result);
		});

		it('bench-teaching', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const result = await runBenchmark(
				app,
				'bench-teaching',
				{
					topology: 'TEACHING',
					sessions: 3,
					publishersPerSession: 1,
					subscribersPerSession: 20,
				},
				beforeMetrics,
			);
			ALL_RESULTS.push(result);
		});
	});

	describe('Saturation', () => {
		it('saturate-one-room-publishers', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const initialErrors = await countAllErrors();
			const sessionName = `Perf-Sat-ORP-${Date.now()}`;

			let pubIndex = 0;
			const stepFn: SaturationStepFn = () => {
				if (pubIndex >= 200) return null;
				pubIndex++;
				return {
					sessionName,
					userId: `Pub-${pubIndex}`,
					role: 'PUBLISHER',
				};
			};

			const result = await runSaturation(
				app,
				stepFn,
				{
					...DEFAULT_SATURATION_CONFIG,
					topology: 'ONE_SESSION_NXN',
					description:
						'Add publishers to single session until failure',
				},
				beforeMetrics,
				initialErrors,
			);
			ALL_RESULTS.push(result);
		});

		it('saturate-one-room-mixed', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const initialErrors = await countAllErrors();
			const sessionName = `Perf-Sat-ORM-${Date.now()}`;

			let teacherCreated = false;
			let subIndex = 0;
			const stepFn: SaturationStepFn = () => {
				if (!teacherCreated) {
					teacherCreated = true;
					return {
						sessionName,
						userId: 'Teacher',
						role: 'PUBLISHER',
					};
				}
				if (subIndex >= 200) return null;
				subIndex++;
				return {
					sessionName,
					userId: `Sub-${subIndex}`,
					role: 'SUBSCRIBER',
				};
			};

			const result = await runSaturation(
				app,
				stepFn,
				{
					...DEFAULT_SATURATION_CONFIG,
					topology: 'ONE_SESSION_NXM',
					description:
						'1 publisher + add subscribers to single session until failure',
				},
				beforeMetrics,
				initialErrors,
			);
			ALL_RESULTS.push(result);
		});

		it('saturate-multi-room-publishers', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const initialErrors = await countAllErrors();
			const sessionBase = `Perf-Sat-MRP-${Date.now()}`;

			let sessionIndex = 0;
			const stepFn: SaturationStepFn = () => {
				if (sessionIndex >= 200) return null;
				sessionIndex++;
				return {
					sessionName: `${sessionBase}-S${sessionIndex}`,
					userId: 'Pub-1',
					role: 'PUBLISHER',
				};
			};

			const result = await runSaturation(
				app,
				stepFn,
				{
					...DEFAULT_SATURATION_CONFIG,
					topology: 'N:N',
					description:
						'New session with 1 publisher each until failure',
				},
				beforeMetrics,
				initialErrors,
			);
			ALL_RESULTS.push(result);
		});

		it('saturate-multi-room-mixed', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const initialErrors = await countAllErrors();
			const sessionBase = `Perf-Sat-MRM-${Date.now()}`;

			let sessionIndex = 0;
			let pubCreated = false;
			const stepFn: SaturationStepFn = () => {
				if (sessionIndex >= 100) return null;
				if (!pubCreated) {
					pubCreated = true;
					return {
						sessionName: `${sessionBase}-S${sessionIndex + 1}`,
						userId: 'Pub-1',
						role: 'PUBLISHER',
					};
				}
				pubCreated = false;
				sessionIndex++;
				return {
					sessionName: `${sessionBase}-S${sessionIndex}`,
					userId: 'Sub-1',
					role: 'SUBSCRIBER',
				};
			};

			const result = await runSaturation(
				app,
				stepFn,
				{
					...DEFAULT_SATURATION_CONFIG,
					topology: 'N:M',
					description:
						'New sessions with 1 pub + 1 sub each until failure',
				},
				beforeMetrics,
				initialErrors,
			);
			ALL_RESULTS.push(result);
		});

		it('saturate-teaching', async () => {
			const { beforeMetrics } = await setupPerformanceTest(app);
			const initialErrors = await countAllErrors();
			const sessionBase = `Perf-Sat-T-${Date.now()}`;

			let sessionIndex = 0;
			const SUBS_PER_SESSION = 10;
			let state: 'pub' | 'sub' = 'pub';
			let subCount = 0;
			const stepFn: SaturationStepFn = () => {
				if (state === 'pub') {
					if (sessionIndex >= 20) return null;
					sessionIndex++;
					state = 'sub';
					subCount = 0;
					return {
						sessionName: `${sessionBase}-S${sessionIndex}`,
						userId: `Teacher-${sessionIndex}`,
						role: 'PUBLISHER',
					};
				}
				subCount++;
				if (subCount >= SUBS_PER_SESSION) {
					state = 'pub';
				}
				return {
					sessionName: `${sessionBase}-S${sessionIndex}`,
					userId: `Sub-${subCount}`,
					role: 'SUBSCRIBER',
				};
			};

			const result = await runSaturation(
				app,
				stepFn,
				{
					...DEFAULT_SATURATION_CONFIG,
					topology: 'TEACHING',
					description:
						'New sessions with 1 teacher + 10 students each until failure',
				},
				beforeMetrics,
				initialErrors,
			);
			ALL_RESULTS.push(result);
		});
	});
});
