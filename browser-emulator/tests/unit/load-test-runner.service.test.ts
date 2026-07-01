import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../src/services/logger.service.js';
import { LoadTestRunnerService } from '../../src/services/browser/emulated/load-test-runner.service.ts';
import type { LoadTestRunRequest } from '../../src/types/load-test.type.ts';

const loggerService = new LoggerService();

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
	getLogs: vi.fn().mockResolvedValue(''),
	stop: vi.fn().mockResolvedValue(undefined),
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
		service = new LoadTestRunnerService(mockLauncher, loggerService);
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
		expect(cmd[cmd.indexOf('--subscribers') + 1]).toBe('2');
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
		expect(cmd[cmd.indexOf('--audio-publishers') + 1]).toBe('1');
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

	it('omits count flags that are zero or missing', async () => {
		await service.startLoadTest({
			openviduUrl: 'wss://ov.example.com',
			livekitApiKey: 'devkey',
			livekitApiSecret: 'secret',
			room: 'room-1',
			videoPublishers: 4,
			audioPublishers: 0,
		});
		const cmd = getLaunchedCommand();
		expect(cmd).toContain('--video-publishers');
		expect(cmd).not.toContain('--audio-publishers');
		expect(cmd).not.toContain('--subscribers');
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
});
