import { describe, it, beforeEach, afterEach, afterAll } from 'vitest';
import { startServer } from '../../src/app.js';
import type { Application } from 'express';
import { setupServerPorts, cleanupServer } from '../e2e/e2e-test-utils.js';
import {
	ensureResultsDir,
	setupPerformanceTest,
	runBenchmark,
	type BenchmarkResult,
	saveRunResults,
} from './perf-test-utils.js';

let app: Application;
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const ALL_RESULTS: BenchmarkResult[] = [];

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

describe('Benchmarks', () => {
	it('bench-one-room-publishers', async () => {
		await setupPerformanceTest(app);
		const result = await runBenchmark(app, 'bench-one-room-publishers', {
			topology: 'ONE_SESSION_NXN',
			sessions: 1,
			publishersPerSession: 8,
			subscribersPerSession: 0,
		});
		ALL_RESULTS.push(result);
	});

	it('bench-one-room-mixed', async () => {
		await setupPerformanceTest(app);
		const result = await runBenchmark(app, 'bench-one-room-mixed', {
			topology: 'ONE_SESSION_NXM',
			sessions: 1,
			publishersPerSession: 1,
			subscribersPerSession: 20,
		});
		ALL_RESULTS.push(result);
	});

	it('bench-multi-room-publishers', async () => {
		await setupPerformanceTest(app);
		const result = await runBenchmark(app, 'bench-multi-room-publishers', {
			topology: 'N:N',
			sessions: 3,
			publishersPerSession: 8,
			subscribersPerSession: 0,
		});
		ALL_RESULTS.push(result);
	});

	it('bench-multi-room-mixed', async () => {
		await setupPerformanceTest(app);
		const result = await runBenchmark(app, 'bench-multi-room-mixed', {
			topology: 'N:M',
			sessions: 2,
			publishersPerSession: 2,
			subscribersPerSession: 10,
		});
		ALL_RESULTS.push(result);
	});
});
