import { describe, it, beforeEach, afterEach } from 'vitest';
import { startServer } from '../../src/app.js';
import type { Application } from 'express';
import {
	run2BrowserTest,
	cleanupServer,
	setupServerPorts,
} from './e2e-test-utils.js';

let app: Application;

beforeEach(async () => {
	await setupServerPorts();
}, 30000);

afterEach(async () => {
	await cleanupServer();
}, 30000);

// IMPORTANT: This test assumes there is a LiveKit server running and accessible with the credentials specified in test configs
describe('Browser-emulator - Emulated browsers', () => {
	describe('LiveKit', () => {
		beforeEach(async () => {
			process.env.COM_MODULE = 'livekit';
			({ app } = await startServer());
		});
		// Added repeats to these tests to increase confidence in stability, as browsers can be flaky
		it('LiveKit basic workflow', { repeats: 0 }, async () => {
			await run2BrowserTest(app, 'livekit', 'emulated');
		});
	});
});
