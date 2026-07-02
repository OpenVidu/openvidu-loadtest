import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../src/services/logger.service.js';
import { LoadTestRunnerService } from '../../src/services/browser/emulated/load-test-runner.service.ts';
import type { LoadTestRunRequest } from '../../src/types/load-test.type.ts';

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
		mockLauncher.isRunning.mockResolvedValue(true);
		mockLauncher.getLogs.mockResolvedValue(SUCCESSFUL_LOGS);
		service = new LoadTestRunnerService(
			mockLauncher,
			mockWsService as never,
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

	it('does not disable simulcast by default and includes optional flags when set', async () => {
		await service.startLoadTest({
			...baseRequest,
			audioPublishers: 1,
			numPerSecond: 5,
			videoResolution: 'medium',
			videoCodec: 'h264',
			identityPrefix: 'pub',
			layout: '3x3',
		});
		const cmd = getLaunchedCommand();

		expect(cmd).not.toContain('--no-simulcast');
		expect(cmd[cmd.indexOf('--num-per-second') + 1]).toBe('5');
		expect(cmd[cmd.indexOf('--video-resolution') + 1]).toBe('medium');
		expect(cmd[cmd.indexOf('--video-codec') + 1]).toBe('h264');
		expect(cmd[cmd.indexOf('--identity-prefix') + 1]).toBe('pub');
		expect(cmd[cmd.indexOf('--layout') + 1]).toBe('3x3');
	});

	it('adds --no-simulcast when simulcast is explicitly false', async () => {
		await service.startLoadTest({ ...baseRequest, simulcast: false });
		expect(getLaunchedCommand()).toContain('--no-simulcast');
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
		it.each([
			[
				'publishing an audio track',
				'publishing audio track - sprgj_pub_1',
			],
			[
				'publishing a video track',
				'publishing video track - sprgj_pub_0',
			],
			[
				'a subscribed audio track',
				'subscribed to track sprgj_2 TR_AMB9K4wdmoNRFw audio 1/4',
			],
			[
				'a subscribed video track',
				'subscribed to track sprgj_2 TR_VCEBkhNo7bjkC7 video 3/4',
			],
			[
				'the finished-connecting line',
				'Finished connecting to room, waiting 1000h0m0s',
			],
		])(
			'accepts logs showing %s as a successful connection',
			async (_label, logLine) => {
				mockLauncher.getLogs.mockResolvedValue(logLine);

				await expect(
					service.startLoadTest(baseRequest),
				).resolves.toMatchObject({ handleId: 'container-id-123' });
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

		it('throws and stops the run when logs never show a connection indicator', async () => {
			vi.useFakeTimers();
			mockLauncher.getLogs.mockResolvedValue('no useful output here');

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
			[
				'a permission-refresh disconnection',
				'turnc ERROR: 2026/07/02 10:39:11 Fail to refresh permissions: transaction closed',
			],
			['a failed publisher connection', 'could not connect Pub 0:'],
			['a failed subscriber connection', 'could not connect Sub 0:'],
		])('stops the run when logs show %s', async (_label, fatalLine) => {
			await service.startLoadTest(baseRequest);
			mockLauncher.getLogs.mockResolvedValue(fatalLine);

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockLauncher.stop).toHaveBeenCalledWith('container-id-123');
			expect(mockWsService.send).toHaveBeenCalledWith(
				expect.stringContaining('LOAD_TEST_RUN_HEALTH_ERROR'),
			);
		});

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
	});
});
