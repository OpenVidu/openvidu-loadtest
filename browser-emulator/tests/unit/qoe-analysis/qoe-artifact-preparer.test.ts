import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import {
	fixVideoResolution,
	preparePresenterArtifacts,
} from '../../../src/services/qoe-analysis/qoe-artifact-preparer.ts';

function createRunner() {
	return {
		runAndCapture: vi.fn(() => Promise.resolve('')),
		quote: vi.fn((value: string) => `"${value}"`),
	};
}

describe('qoe-artifact-preparer', () => {
	it('preparePresenterArtifacts builds and runs expected commands', async () => {
		const runner = createRunner();

		const artifacts = await preparePresenterArtifacts(
			runner as never,
			'/tmp/work',
			{
				viewerPath: '/tmp/viewer.webm',
				presenterPath: '/tmp/presenter.y4m',
				presenterAudioPath: '/tmp/presenter.wav',
				prefix: 'p',
				fragmentDurationSecs: 5,
				paddingDurationSecs: 1,
				width: 640,
				height: 480,
				fps: 30,
				allAnalysis: false,
				debug: false,
			},
		);

		expect(artifacts).toEqual({
			presenterYuv: path.join('/tmp/work', 'presenter.yuv'),
			presenterWav: path.join('/tmp/work', 'presenter.wav'),
			presenterPesqWav: path.join('/tmp/work', 'presenter-pesq.wav'),
		});
		expect(runner.runAndCapture).toHaveBeenCalledTimes(3);
		expect(runner.runAndCapture).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining('-ss 1 -to 6'),
		);
		expect(runner.runAndCapture).toHaveBeenNthCalledWith(
			3,
			expect.stringContaining('-ar 16000'),
		);
	});

	it('fixVideoResolution runs ffmpeg scale command', async () => {
		const runner = createRunner();

		await fixVideoResolution(
			runner as never,
			'/tmp/in.webm',
			'/tmp/out.webm',
			1280,
			720,
		);

		expect(runner.runAndCapture).toHaveBeenCalledTimes(1);
		expect(runner.runAndCapture).toHaveBeenCalledWith(
			expect.stringContaining('-vf scale=1280:720'),
		);
	});
});
