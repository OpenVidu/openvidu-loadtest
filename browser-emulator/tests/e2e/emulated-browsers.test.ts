import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { startServer } from '../../src/app.js';
import type { Application } from 'express';
import { getConfig, checkDeploymentReachable } from '../utils/test-config.js';
import {
	runMultiEmulatedLoadTest,
	cleanupServer,
	setupServerPorts,
	pingInstance,
	initializeInstance,
	createLoadTestRun,
	assertLoadTestParticipantsJoined,
	waitForBrowsersToSendStats,
	assertNoLiveKitCliUnpublishedTracks,
	cleanUsers,
	MIN_MULTI_EMULATED_LIVEKIT_DURATION_SECONDS,
} from './e2e-test-utils.js';

let app: Application;

beforeEach(async () => {
	await setupServerPorts();
}, 30000);

afterEach(async () => {
	await cleanupServer();
}, 30000);

// IMPORTANT: This test assumes there is a LiveKit server running and accessible with the credentials specified in test configs
describe('Browser-emulator - Emulated browsers (LOADTEST mode)', () => {
	describe('LiveKit', () => {
		beforeEach(async () => {
			process.env.COM_MODULE = 'livekit';
			({ app } = await startServer());
		});
		// Added repeats to these tests to increase confidence in stability, as browsers can be flaky
		it('LiveKit load-test workflow', { repeats: 10 }, async () => {
			await runMultiEmulatedLoadTest(app, 2, 0, 0, 10);
		});

		// Verifies the /load-test endpoint does not respond OK until every requested
		// participant has finished connecting: with numPerSecond=1 and 6 video
		// publishers (each also mirrored into an audio publisher and a subscriber),
		// the connect phase throttles to one participant per second, so the request
		// must take over 6 seconds to resolve.
		it('waits until every participant is connected before responding, even when throttled by numPerSecond', async () => {
			await pingInstance(app);
			const config = getConfig();
			await checkDeploymentReachable(config.livekitUrl);
			await initializeInstance(app);

			const room = 'Room' + Date.now();
			const videoPublishers = 6;
			const numPerSecond = 1;

			const startTime = Date.now();
			await createLoadTestRun(app, room, {
				videoPublishers,
				numPerSecond,
			});
			const elapsedSeconds = (Date.now() - startTime) / 1000;

			expect(elapsedSeconds).toBeGreaterThan(videoPublishers);

			await assertLoadTestParticipantsJoined(room, videoPublishers);
			await waitForBrowsersToSendStats(
				MIN_MULTI_EMULATED_LIVEKIT_DURATION_SECONDS,
			);
			await assertNoLiveKitCliUnpublishedTracks(room);
			await cleanUsers(app);
		});
	});
});
