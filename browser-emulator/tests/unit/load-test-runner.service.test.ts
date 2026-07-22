import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../src/services/logger.service.js';
import { LoadTestRunnerService } from '../../src/services/browser/emulated/load-test-runner.service.ts';
import type { LoadTestRunRequest } from '../../src/types/load-test.type.ts';

const mockCreateAllStatFilesForSession = vi.hoisted(() =>
	vi.fn().mockResolvedValue(undefined),
);

vi.mock('../../src/utils/stats-files.js', () => ({
	ERRORS_FILE: 'errors.json',
	addSaveStatsToFileToQueue: vi.fn(),
	createAllStatFilesForSession: mockCreateAllStatFilesForSession,
}));

const loggerService = new LoggerService();

const SUCCESSFUL_LOGS = 'Finished connecting to room, waiting 1000h0m0s';

const mockLauncher = {
	mode: 'docker' as const,
	createParticipant: vi.fn().mockResolvedValue({
		participantId: 'loadtest-run',
		handleId: 'container-id-123',
		sessionName: 'room-1',
		userName: 'loadtest',
		createdAt: new Date(),
	}),
	isRunning: vi.fn().mockResolvedValue(true),
	getLogs: vi.fn().mockResolvedValue(SUCCESSFUL_LOGS),
	stop: vi.fn().mockResolvedValue(undefined),
};

const mockWsService = {
	send: vi.fn(),
};

const mockWebhookRoutingService = {
	setCredentials: vi.fn(),
	registerPrefix: vi.fn(),
	unregisterPrefix: vi.fn(),
	registerIdentity: vi.fn(),
	unregisterIdentity: vi.fn(),
	dispatch: vi.fn(),
};

const baseRequest: LoadTestRunRequest = {
	openviduUrl: 'wss://ov.example.com',
	livekitApiKey: 'devkey',
	livekitApiSecret: 'secret',
	room: 'room-1',
	videoPublishers: 3,
	subscribers: 2,
};

function getLaunchedCommand(): string[] {
	return mockLauncher.createParticipant.mock.calls[0][0] as string[];
}

describe('LoadTestRunnerService', () => {
	let service: LoadTestRunnerService;

	beforeEach(() => {
		vi.clearAllMocks();
		mockCreateAllStatFilesForSession.mockResolvedValue(undefined);
		mockLauncher.isRunning.mockResolvedValue(true);
		mockLauncher.getLogs.mockResolvedValue(SUCCESSFUL_LOGS);
		service = new LoadTestRunnerService(
			mockLauncher,
			mockWsService as never,
			mockWebhookRoutingService as never,
			loggerService,
		);
	});

	afterEach(async () => {
		await service.stopAll();
		vi.useRealTimers();
	});

	it('builds an lk load-test command with url over http(s) and credentials', async () => {
		await service.startLoadTest(baseRequest);
		const cmd = getLaunchedCommand();

		expect(cmd.slice(0, 1)).toEqual(['load-test']);
		expect(cmd).toContain('--url');
		expect(cmd[cmd.indexOf('--url') + 1]).toBe('https://ov.example.com');
		expect(cmd[cmd.indexOf('--api-key') + 1]).toBe('devkey');
		expect(cmd[cmd.indexOf('--api-secret') + 1]).toBe('secret');
		expect(cmd[cmd.indexOf('--room') + 1]).toBe('room-1');
		expect(cmd[cmd.indexOf('--video-publishers') + 1]).toBe('3');
		// baseRequest.subscribers (2) + videoPublishers (3), each publisher also subscribes.
		expect(cmd[cmd.indexOf('--subscribers') + 1]).toBe('5');
	});

	it('always passes --identity-prefix set to the run id, not configurable by the caller', async () => {
		const { runId } = await service.startLoadTest(baseRequest);
		const cmd = getLaunchedCommand();

		expect(cmd).toContain('--identity-prefix');
		expect(cmd[cmd.indexOf('--identity-prefix') + 1]).toBe(runId);
	});

	it('creates the run stats/errors files before the run can report any error (regression: ENOENT writing errors.json)', async () => {
		const { runId } = await service.startLoadTest(baseRequest);

		expect(mockCreateAllStatFilesForSession).toHaveBeenCalledWith(
			runId,
			baseRequest.room,
		);
	});

	it('registers the run identity as a webhook prefix and unregisters it on stop', async () => {
		const { runId } = await service.startLoadTest(baseRequest);

		expect(mockWebhookRoutingService.setCredentials).toHaveBeenCalledWith(
			baseRequest.livekitApiKey,
			baseRequest.livekitApiSecret,
		);
		expect(mockWebhookRoutingService.registerPrefix).toHaveBeenCalledWith(
			runId,
			expect.any(Function),
		);

		await service.stopLoadTest(runId);

		expect(mockWebhookRoutingService.unregisterPrefix).toHaveBeenCalledWith(
			runId,
		);
	});

	it('reports a webhook-triggered error once, without stopping the run', async () => {
		await service.startLoadTest(baseRequest);
		const webhookHandler = mockWebhookRoutingService.registerPrefix.mock
			.calls[0][1] as (eventType: string, room: string) => void;

		webhookHandler('participant_left', 'room-1');
		webhookHandler('participant_left', 'room-1');

		expect(mockWsService.send).toHaveBeenCalledTimes(1);
		expect(
			JSON.parse(mockWsService.send.mock.calls[0][0] as string),
		).toEqual(
			expect.objectContaining({
				event: 'LOAD_TEST_RUN_HEALTH_ERROR',
				reason: 'webhook-participant_left',
			}),
		);
		expect(mockLauncher.stop).not.toHaveBeenCalled();
	});

	it('disables simulcast by default and includes optional flags when set', async () => {
		const { runId } = await service.startLoadTest({
			...baseRequest,
			audioPublishers: 1,
			numPerSecond: 5,
			videoResolution: 'medium',
			videoCodec: 'h264',
			layout: '3x3',
		});
		const cmd = getLaunchedCommand();

		expect(cmd).toContain('--no-simulcast');
		expect(cmd[cmd.indexOf('--num-per-second') + 1]).toBe('5');
		expect(cmd[cmd.indexOf('--video-resolution') + 1]).toBe('medium');
		expect(cmd[cmd.indexOf('--video-codec') + 1]).toBe('h264');
		expect(cmd[cmd.indexOf('--identity-prefix') + 1]).toBe(runId);
		expect(cmd[cmd.indexOf('--layout') + 1]).toBe('3x3');
	});

	it('adds --no-simulcast when simulcast is explicitly false', async () => {
		await service.startLoadTest({ ...baseRequest, simulcast: false });
		expect(getLaunchedCommand()).toContain('--no-simulcast');
	});

	it('omits --no-simulcast when simulcast is explicitly true', async () => {
		await service.startLoadTest({ ...baseRequest, simulcast: true });
		expect(getLaunchedCommand()).not.toContain('--no-simulcast');
	});

	it('omits publisher/subscriber flags when there are no video publishers', async () => {
		await service.startLoadTest({
			openviduUrl: 'wss://ov.example.com',
			livekitApiKey: 'devkey',
			livekitApiSecret: 'secret',
			room: 'room-1',
			subscribers: 5,
		});
		const cmd = getLaunchedCommand();
		expect(cmd).not.toContain('--video-publishers');
		expect(cmd).not.toContain('--audio-publishers');
		expect(cmd[cmd.indexOf('--subscribers') + 1]).toBe('5');
	});

	describe('publisher mirroring (mirrors NORMAL mode: each publisher also publishes audio and subscribes)', () => {
		it('adds one audio publisher and one subscriber per video publisher', async () => {
			await service.startLoadTest({
				openviduUrl: 'wss://ov.example.com',
				livekitApiKey: 'devkey',
				livekitApiSecret: 'secret',
				room: 'room-1',
				videoPublishers: 4,
			});
			const cmd = getLaunchedCommand();
			expect(cmd[cmd.indexOf('--video-publishers') + 1]).toBe('4');
			expect(cmd[cmd.indexOf('--audio-publishers') + 1]).toBe('4');
			expect(cmd[cmd.indexOf('--subscribers') + 1]).toBe('4');
		});

		it('adds mirrored counts on top of explicitly requested audio publishers and subscribers', async () => {
			await service.startLoadTest({
				openviduUrl: 'wss://ov.example.com',
				livekitApiKey: 'devkey',
				livekitApiSecret: 'secret',
				room: 'room-1',
				videoPublishers: 4,
				audioPublishers: 2,
				subscribers: 10,
			});
			const cmd = getLaunchedCommand();
			expect(cmd[cmd.indexOf('--video-publishers') + 1]).toBe('4');
			expect(cmd[cmd.indexOf('--audio-publishers') + 1]).toBe('6');
			expect(cmd[cmd.indexOf('--subscribers') + 1]).toBe('14');
		});
	});

	describe('layout default', () => {
		it('defaults to 5x5 when layout is not specified', async () => {
			await service.startLoadTest(baseRequest);
			const cmd = getLaunchedCommand();
			expect(cmd[cmd.indexOf('--layout') + 1]).toBe('5x5');
		});

		it('uses the requested layout when specified', async () => {
			await service.startLoadTest({ ...baseRequest, layout: '4x4' });
			const cmd = getLaunchedCommand();
			expect(cmd[cmd.indexOf('--layout') + 1]).toBe('4x4');
		});
	});

	it('stops a tracked run and stops all runs on stopAll', async () => {
		const { runId } = await service.startLoadTest(baseRequest);
		await service.stopLoadTest(runId);
		expect(mockLauncher.stop).toHaveBeenCalledWith('container-id-123');

		// A second run torn down via stopAll
		await service.startLoadTest(baseRequest);
		await service.stopAll();
		expect(mockLauncher.stop).toHaveBeenCalledTimes(2);
	});

	describe('connection verification', () => {
		it('accepts logs showing the finished-connecting line as all participants connected', async () => {
			mockLauncher.getLogs.mockResolvedValue(
				'Finished connecting to room, waiting 1000h0m0s',
			);

			await expect(
				service.startLoadTest(baseRequest),
			).resolves.toMatchObject({ handleId: 'container-id-123' });
		});

		it.each([
			[
				'only a publishing track line (not all participants connected yet)',
				'publishing audio track - sprgj_pub_1',
			],
			[
				'only a subscribed track line (not all participants connected yet)',
				'subscribed to track sprgj_2 TR_AMB9K4wdmoNRFw audio 1/4',
			],
			['no useful output', 'no useful output here'],
		])(
			'throws and stops the run when logs show %s',
			async (_label, logLine) => {
				vi.useFakeTimers();
				mockLauncher.getLogs.mockResolvedValue(logLine);

				const promise = service.startLoadTest(baseRequest);
				const assertion = expect(promise).rejects.toThrow(
					/failed to connect any participant/,
				);
				await vi.runAllTimersAsync();
				await assertion;

				expect(mockLauncher.stop).toHaveBeenCalledWith(
					'container-id-123',
				);
			},
		);

		it('throws and stops the run when the process never reports running', async () => {
			vi.useFakeTimers();
			mockLauncher.isRunning.mockResolvedValue(false);

			const promise = service.startLoadTest(baseRequest);
			const assertion = expect(promise).rejects.toThrow(
				/failed to connect any participant/,
			);
			await vi.runAllTimersAsync();
			await assertion;

			expect(mockLauncher.stop).toHaveBeenCalledWith('container-id-123');
		});
	});

	describe('health check', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		it.each([
			['a failed publisher connection', 'could not connect Pub 0:'],
			['a failed subscriber connection', 'could not connect Sub 0:'],
			[
				'a consumeTrack nil pointer panic',
				'caught panic in consumeTrack runtime error: invalid memory address or nil pointer dereference',
			],
		])(
			'notifies but does not stop the run when logs show %s (a single user failure, not a process crash)',
			async (_label, fatalLine) => {
				await service.startLoadTest(baseRequest);
				mockLauncher.getLogs.mockResolvedValue(fatalLine);

				await vi.advanceTimersByTimeAsync(5000);

				expect(mockLauncher.stop).not.toHaveBeenCalled();
				expect(mockWsService.send).toHaveBeenCalledWith(
					expect.stringContaining('LOAD_TEST_RUN_HEALTH_ERROR'),
				);

				// Does not keep re-notifying on every subsequent tick.
				mockWsService.send.mockClear();
				await vi.advanceTimersByTimeAsync(5000);
				expect(mockWsService.send).not.toHaveBeenCalled();
			},
		);

		it('stops the run when the process is no longer running', async () => {
			await service.startLoadTest(baseRequest);
			mockLauncher.isRunning.mockResolvedValue(false);

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockLauncher.stop).toHaveBeenCalledWith('container-id-123');
		});

		it('does not stop a healthy run', async () => {
			await service.startLoadTest(baseRequest);
			mockLauncher.stop.mockClear();

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockLauncher.stop).not.toHaveBeenCalled();
		});

		it('logs a line that matches none of the known success/fatal/informational patterns', async () => {
			const mockLogger = {
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};
			const localService = new LoadTestRunnerService(
				mockLauncher,
				mockWsService as never,
				mockWebhookRoutingService as never,
				{ getLogger: () => mockLogger } as never,
			);
			mockLauncher.getLogs.mockResolvedValue(
				`some unexpected line from lk load-test\n${SUCCESSFUL_LOGS}`,
			);

			await localService.startLoadTest(baseRequest);
			mockLogger.info.mockClear();

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockLogger.info).toHaveBeenCalledWith(
				expect.objectContaining({
					line: 'some unexpected line from lk load-test',
				}),
				'Unrecognized lk load-test log line',
			);

			// Does not keep re-logging the same already-scanned line.
			mockLogger.info.mockClear();
			await vi.advanceTimersByTimeAsync(5000);
			expect(mockLogger.info).not.toHaveBeenCalled();

			await localService.stopAll();
		});

		it.each([
			[
				'a publishing audio track line',
				'publishing audio track - sprgj_pub_1',
			],
			[
				'a publishing simulcast video track line',
				'publishing simulcast video track - sprgj_pub_0',
			],
			[
				'a subscribed track line',
				'subscribed to track sprgj_2 TR_AMB9K4wdmoNRFw audio 1/4',
			],
			['the finished-connecting line', SUCCESSFUL_LOGS],
			['a fatal indicator line', 'could not connect Pub 0:'],
		])('does not log %s as unrecognized', async (_label, knownLine) => {
			const mockLogger = {
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};
			const localService = new LoadTestRunnerService(
				mockLauncher,
				mockWsService as never,
				mockWebhookRoutingService as never,
				{ getLogger: () => mockLogger } as never,
			);
			// Combined with the finished-connecting line so startup's own
			// connection check succeeds regardless of which line is under test.
			mockLauncher.getLogs.mockResolvedValue(
				`${SUCCESSFUL_LOGS}\n${knownLine}`,
			);

			await localService.startLoadTest(baseRequest);
			mockLogger.info.mockClear();

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockLogger.info).not.toHaveBeenCalledWith(
				expect.anything(),
				'Unrecognized lk load-test log line',
			);

			await localService.stopAll();
		});
	});
});
