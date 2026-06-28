import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { LoggerService } from '../../src/services/logger.service.js';
import { DirectLauncher } from '../../src/services/browser/emulated/direct-launcher.js';

const loggerService = new LoggerService();

const { mockSpawn, mockAccess } = vi.hoisted(() => ({
	mockSpawn: vi.fn(),
	mockAccess: vi.fn(),
}));

vi.mock('node:child_process', () => ({
	spawn: mockSpawn,
}));

vi.mock('node:fs/promises', () => ({
	access: mockAccess,
	constants: { X_OK: 1, F_OK: 0, R_OK: 4, W_OK: 2 },
}));

describe('DirectLauncher', () => {
	let launcher: DirectLauncher;
	const fakeCliPath = '/usr/local/bin/lk';

	beforeEach(() => {
		launcher = new DirectLauncher(loggerService, fakeCliPath);
		mockAccess.mockReset();
		mockSpawn.mockReset();
		mockAccess.mockResolvedValue(undefined);
		mockSpawn.mockReturnValue({
			pid: 99999,
			stdout: { on: vi.fn() },
			stderr: { on: vi.fn() },
			on: vi.fn(),
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('mode', () => {
		it('should return "direct"', () => {
			expect(launcher.mode).toBe('direct');
		});
	});

	describe('ensureBinaryExists', () => {
		it('should throw if binary does not exist', async () => {
			mockAccess.mockRejectedValue(new Error('ENOENT'));

			await expect(launcher.ensureBinaryExists()).rejects.toThrow(
				'lk binary not found at /usr/local/bin/lk',
			);
		});

		it('should resolve if binary exists', async () => {
			await expect(
				launcher.ensureBinaryExists(),
			).resolves.toBeUndefined();
		});
	});

	describe('createParticipant', () => {
		it('should spawn lk with correct command', async () => {
			const proc = {
				pid: 12345,
				stdout: { on: vi.fn() },
				stderr: { on: vi.fn() },
				on: vi.fn(),
			};
			mockSpawn.mockReturnValue(proc);

			const handle = await launcher.createParticipant(
				['room', 'join', '--url', 'ws://localhost:7880', 'test-room'],
				'participant-1',
				'test-session',
				'test-user',
				'/tmp/sock/video.sock',
			);

			expect(mockSpawn).toHaveBeenCalledWith(
				fakeCliPath,
				['room', 'join', '--url', 'ws://localhost:7880', 'test-room'],
				{ stdio: ['ignore', 'pipe', 'pipe'] },
			);

			expect(handle.handleId).toBe('12345');
			expect(handle.participantId).toBe('participant-1');
			expect(handle.sessionName).toBe('test-session');
			expect(handle.userName).toBe('test-user');
			expect(handle.videoSocket).toBe('/tmp/sock/video.sock');
		});

		it('should capture stdout and stderr', async () => {
			const stdoutOn = vi.fn();
			const stderrOn = vi.fn();
			mockSpawn.mockReturnValue({
				pid: 12346,
				stdout: { on: stdoutOn },
				stderr: { on: stderrOn },
				on: vi.fn(),
			});

			await launcher.createParticipant(
				['room', 'join', 'test-room'],
				'participant-2',
				'session-2',
				'user-2',
			);

			const stdoutCalls = stdoutOn.mock.calls.filter(
				(c: unknown[]) => c[0] === 'data',
			);
			const stderrCalls = stderrOn.mock.calls.filter(
				(c: unknown[]) => c[0] === 'data',
			);

			const stdoutHandler = stdoutCalls[0]?.[1] as
				| ((buf: Buffer) => void)
				| undefined;
			const stderrHandler = stderrCalls[0]?.[1] as
				| ((buf: Buffer) => void)
				| undefined;

			if (stdoutHandler) {
				stdoutHandler(Buffer.from('connected to room\n'));
			}
			if (stderrHandler) {
				stderrHandler(Buffer.from('warn: some warning\n'));
			}

			const logs = await launcher.getLogs('12346');
			expect(logs).toContain('connected to room');
			expect(logs).toContain('warn: some warning');
		});
	});

	describe('isRunning', () => {
		it('should return false for NaN pid', async () => {
			const result = await launcher.isRunning('not-a-number');
			expect(result).toBe(false);
		});

		it('should return true when process.kill(pid, 0) succeeds', async () => {
			const killMock = vi.spyOn(process, 'kill').mockReturnValue(true);

			const result = await launcher.isRunning('99999');

			expect(killMock).toHaveBeenCalledWith(99999, 0);
			expect(result).toBe(true);
		});

		it('should return false when process.kill(pid, 0) throws', async () => {
			vi.spyOn(process, 'kill').mockImplementation(() => {
				throw new Error('ESRCH');
			});

			const result = await launcher.isRunning('99999');

			expect(result).toBe(false);
		});
	});

	describe('getLogs', () => {
		it('should return empty string for unknown pid', async () => {
			const logs = await launcher.getLogs('unknown');
			expect(logs).toBe('');
		});
	});

	describe('stop', () => {
		it('should do nothing for unknown handle', async () => {
			const killSpy = vi.spyOn(process, 'kill');

			await launcher.stop('unknown');

			expect(killSpy).not.toHaveBeenCalled();
		});

		it('should send SIGTERM and resolve on process exit', async () => {
			let exitHandler: (() => void) | undefined;
			mockSpawn.mockReturnValue({
				pid: 12348,
				stdout: { on: vi.fn() },
				stderr: { on: vi.fn() },
				on: vi.fn((_event: string, handler: () => void) => {
					if (_event === 'exit') {
						exitHandler = handler;
					}
				}),
			});

			const handle = await launcher.createParticipant(
				['room', 'join', 'test-room'],
				'p5',
				's5',
				'u5',
			);

			const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

			const stopPromise = launcher.stop(handle.handleId);

			expect(killSpy).toHaveBeenCalledWith(12348, 'SIGTERM');

			if (exitHandler) {
				exitHandler();
			}

			await stopPromise;
		});
	});
});
