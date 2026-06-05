import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RunnerOptions {
	stdoutCallback?: (chunk: string) => void;
	stderrCallback?: (chunk: string) => void;
	stdoutBufferCallback?: (chunk: Buffer) => void;
}

import { QoeCommandRunner } from '../../../src/services/qoe-analysis/qoe-command-runner.ts';

describe('QoeCommandRunner', () => {
	const runMock = vi.fn();
	const scriptRunnerService = {
		run: runMock,
	};
	const runner = new QoeCommandRunner(scriptRunnerService as never);

	beforeEach(() => {
		runMock.mockReset();
	});

	it('runAndCapture collects stdout and stderr', async () => {
		runMock.mockImplementation(
			(_command: string, options?: RunnerOptions) => {
				options?.stdoutCallback?.('out');
				options?.stderrCallback?.('err');
				return Promise.resolve();
			},
		);

		const output = await runner.runAndCapture('echo test');

		expect(output).toBe('out\nerr');
	});

	it('streamRawFrames forwards buffer chunks', async () => {
		const onChunk = vi.fn();
		runMock.mockImplementation(
			(_command: string, options?: RunnerOptions) => {
				const chunk = Buffer.from([1, 2, 3]);
				options?.stdoutBufferCallback?.(chunk);
				return Promise.resolve();
			},
		);

		await runner.streamRawFrames('ffmpeg ...', onChunk);

		expect(onChunk).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
	});

	it('quote escapes double quotes', () => {
		expect(runner.quote('a"b')).toBe(String.raw`"a\"b"`);
	});
});
