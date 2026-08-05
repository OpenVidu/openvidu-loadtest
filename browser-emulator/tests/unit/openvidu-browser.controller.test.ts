import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../src/services/logger.service.js';
import { OpenViduBrowserController } from '../../src/controllers/openvidu-browser.controller.ts';
import { Resolution, Role } from '../../src/types/create-user.type.ts';

const loggerService = new LoggerService();

function buildRequest(properties: Record<string, unknown>) {
	return {
		body: {
			openviduUrl: 'https://openvidu.example.com',
			properties: {
				userId: 'user1',
				sessionName: 'session1',
				role: Role.PUBLISHER,
				audio: true,
				video: true,
				resolution: Resolution.DEFAULT,
				frameRate: 30,
				browser: 'chrome',
				...properties,
			},
		},
	} as never;
}

function buildResponse() {
	return {
		status: vi.fn().mockReturnThis(),
		send: vi.fn().mockReturnThis(),
	} as never as { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}

describe('OpenViduBrowserController /streamManager videoCodec handling', () => {
	let comModule: {
		areParametersCorrect: ReturnType<typeof vi.fn>;
		processNewUserRequest: ReturnType<typeof vi.fn>;
	};
	let browserManagerService: {
		createStreamManager: ReturnType<typeof vi.fn>;
	};
	let controller: OpenViduBrowserController;

	beforeEach(() => {
		comModule = {
			areParametersCorrect: vi.fn().mockReturnValue(true),
			processNewUserRequest: vi.fn().mockResolvedValue(undefined),
		};
		browserManagerService = {
			createStreamManager: vi.fn().mockImplementation(async (req) => ({
				connectionId: 'conn1',
				streams: 1,
				participants: 1,
				workerCpuUsage: 0,
				sessionId: req.properties.sessionName,
				userId: req.properties.userId,
				videoCodec: req.properties.videoCodec,
			})),
		};
		controller = new OpenViduBrowserController(
			comModule as never,
			browserManagerService as never,
			loggerService,
		);
	});

	function getStreamManagerPostHandler() {
		const layer = (
			controller.getRouter() as never as { stack: unknown[] }
		).stack[0] as {
			route: { stack: { handle: (...args: unknown[]) => unknown }[] };
		};
		return layer.route.stack[layer.route.stack.length - 1].handle as (
			req: unknown,
			res: unknown,
		) => Promise<void>;
	}

	it('passes through a recognized videoCodec for a real browser', async () => {
		const req = buildRequest({ browser: 'chrome', videoCodec: 'vp9' });
		const res = buildResponse();

		await getStreamManagerPostHandler()(req, res);

		expect(browserManagerService.createStreamManager).toHaveBeenCalledWith(
			expect.objectContaining({
				properties: expect.objectContaining({ videoCodec: 'vp9' }),
			}),
		);
	});

	it('drops an unrecognized videoCodec value', async () => {
		const req = buildRequest({
			browser: 'chrome',
			videoCodec: 'not-a-codec',
		});
		const res = buildResponse();

		await getStreamManagerPostHandler()(req, res);

		expect(browserManagerService.createStreamManager).toHaveBeenCalledWith(
			expect.objectContaining({
				properties: expect.objectContaining({
					videoCodec: undefined,
				}),
			}),
		);
	});

	it('drops a non-h264 videoCodec for custom-emulated browsers', async () => {
		const req = buildRequest({
			browser: 'custom-emulated',
			videoCodec: 'vp8',
		});
		const res = buildResponse();

		await getStreamManagerPostHandler()(req, res);

		expect(browserManagerService.createStreamManager).toHaveBeenCalledWith(
			expect.objectContaining({
				properties: expect.objectContaining({
					videoCodec: undefined,
				}),
			}),
		);
	});

	it('keeps h264 for custom-emulated browsers', async () => {
		const req = buildRequest({
			browser: 'custom-emulated',
			videoCodec: 'h264',
		});
		const res = buildResponse();

		await getStreamManagerPostHandler()(req, res);

		expect(browserManagerService.createStreamManager).toHaveBeenCalledWith(
			expect.objectContaining({
				properties: expect.objectContaining({ videoCodec: 'h264' }),
			}),
		);
	});
});
