import { describe, it, beforeEach, afterEach, afterAll } from 'vitest';
import { startServer } from '../../src/app.js';
import type { Application } from 'express';
import { setupServerPorts, cleanupServer } from '../e2e/e2e-test-utils.js';
import {
	ensureResultsDir,
	setupPerformanceTest,
	runSaturation,
	DEFAULT_SATURATION_CONFIG,
	type SaturationStepFn,
	type SaturationResult,
	saveRunResults,
} from './perf-test-utils.js';

let app: Application;
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const ALL_RESULTS: SaturationResult[] = [];

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

describe('Saturation', () => {
	it('saturate-one-room-publishers', async () => {
		await setupPerformanceTest(app);
		const sessionName = `Perf-Sat-ORP-${Date.now()}`;

		let pubIndex = 0;
		const stepFn: SaturationStepFn = () => {
			pubIndex++;
			return {
				sessionName,
				userId: `Pub-${pubIndex}`,
				role: 'PUBLISHER',
			};
		};

		const result = await runSaturation(app, stepFn, {
			...DEFAULT_SATURATION_CONFIG,
			topology: 'ONE_SESSION_NXN',
			description: 'Add publishers to single session until failure',
		});
		ALL_RESULTS.push(result);
	});

	it('saturate-one-room-mixed', async () => {
		await setupPerformanceTest(app);
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
			subIndex++;
			return {
				sessionName,
				userId: `Sub-${subIndex}`,
				role: 'SUBSCRIBER',
			};
		};

		const result = await runSaturation(app, stepFn, {
			...DEFAULT_SATURATION_CONFIG,
			topology: 'ONE_SESSION_NXM',
			description:
				'1 publisher + add subscribers to single session until failure',
		});
		ALL_RESULTS.push(result);
	});

	it('saturate-multi-room-publishers', async () => {
		await setupPerformanceTest(app);
		const sessionBase = `Perf-Sat-MRP-${Date.now()}`;

		let sessionIndex = 0;
		const stepFn: SaturationStepFn = () => {
			sessionIndex++;
			return {
				sessionName: `${sessionBase}-S${sessionIndex}`,
				userId: 'Pub-1',
				role: 'PUBLISHER',
			};
		};

		const result = await runSaturation(app, stepFn, {
			...DEFAULT_SATURATION_CONFIG,
			topology: 'N:N',
			description: 'New session with 1 publisher each until failure',
		});
		ALL_RESULTS.push(result);
	});

	it('saturate-multi-room-mixed', async () => {
		await setupPerformanceTest(app);
		const sessionBase = `Perf-Sat-MRM-${Date.now()}`;

		let sessionIndex = 0;
		const PUBS_PER_SESSION = 2;
		const SUBS_PER_SESSION = 10;
		let state: 'pub' | 'sub' = 'pub';
		let pubCount = 0;
		let subCount = 0;
		const stepFn: SaturationStepFn = () => {
			if (state === 'pub') {
				if (pubCount === 0) {
					sessionIndex++;
				}
				pubCount++;
				if (pubCount >= PUBS_PER_SESSION) {
					state = 'sub';
					subCount = 0;
					pubCount = 0;
				}
				return {
					sessionName: `${sessionBase}-S${sessionIndex}`,
					userId: `Pub-${pubCount}-S${sessionIndex}`,
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

		const result = await runSaturation(app, stepFn, {
			...DEFAULT_SATURATION_CONFIG,
			topology: 'N:M',
			description:
				'New sessions with 2 pubs + 10 subs each until failure',
		});
		ALL_RESULTS.push(result);
	});
});
