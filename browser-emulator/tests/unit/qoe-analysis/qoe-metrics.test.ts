import fsPromises from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildAlignedViewerYuvMock = vi.hoisted(() =>
	vi.fn(async () => Promise.resolve(true)),
);

vi.mock('../../../src/services/qoe-analysis/qoe-ocr-aligner.ts', () => ({
	buildAlignedViewerYuv: buildAlignedViewerYuvMock,
}));

import { runCutAnalysis } from '../../../src/services/qoe-analysis/qoe-metrics.ts';

describe('qoe-metrics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(fsPromises, 'writeFile').mockResolvedValue(undefined);
		vi.spyOn(fsPromises, 'readFile').mockImplementation(pathArg => {
			let filePath = '';
			if (typeof pathArg === 'string') {
				filePath = pathArg;
			} else if (pathArg instanceof URL) {
				filePath = pathArg.toString();
			}
			if (filePath.endsWith('_vmaf.json')) {
				return Promise.resolve(
					JSON.stringify({
						pooled_metrics: { vmaf: { mean: 80 } },
					}),
				);
			}
			if (filePath.endsWith('.csv')) {
				return Promise.resolve('frame,value\n0,2\n1,4\n');
			}
			return Promise.resolve('');
		});
	});

	it('computes normalized VMAF and ViSQOL in baseline mode', async () => {
		const runner = {
			runAndCapture: vi.fn((command: string) => {
				if (command.startsWith('visqol')) {
					return Promise.resolve('MOS-LQO: 4.0');
				}
				return Promise.resolve('');
			}),
			quote: vi.fn((value: string) => `"${value}"`),
		};

		const result = await runCutAnalysis(
			runner as never,
			{ cutIndex: 0, startSeconds: 1, endSeconds: 6 },
			{
				viewerPath: '/tmp/viewer.webm',
				presenterPath: '/tmp/presenter.y4m',
				presenterAudioPath: '/tmp/presenter.wav',
				prefix: 'v-s-u1-u2',
				fragmentDurationSecs: 5,
				paddingDurationSecs: 1,
				width: 640,
				height: 480,
				fps: 30,
			},
			{
				presenterYuv: '/tmp/presenter.yuv',
				presenterWav: '/tmp/presenter.wav',
				presenterPesqWav: '/tmp/presenter-pesq.wav',
			},
			'/tmp/work',
			{
				rawDir: '/tmp/ocr_raw',
				fullDir: '/tmp/ocr_full',
			},
			150,
		);

		expect(result).toEqual({
			cut_index: 0,
			vmaf: 0.8,
			visqol: 0.75,
		});
	});

	it('adds full-analysis metrics when enabled', async () => {
		const runner = {
			runAndCapture: vi.fn((command: string) => {
				if (command.startsWith('visqol')) {
					return Promise.resolve('MOS-LQO: 5.0');
				}
				if (command.startsWith('pesq')) {
					return Promise.resolve('Raw MOS = 3.0\nMOS-LQO = 4.0');
				}
				return Promise.resolve('');
			}),
			quote: vi.fn((value: string) => `"${value}"`),
		};

		const result = await runCutAnalysis(
			runner as never,
			{ cutIndex: 1, startSeconds: 1, endSeconds: 6 },
			{
				viewerPath: '/tmp/viewer.webm',
				presenterPath: '/tmp/presenter.y4m',
				presenterAudioPath: '/tmp/presenter.wav',
				prefix: 'v-s-u1-u2',
				fragmentDurationSecs: 5,
				paddingDurationSecs: 1,
				width: 640,
				height: 480,
				fps: 30,
				qoeConfig: { allAnalysis: true, debug: false },
			},
			{
				presenterYuv: '/tmp/presenter.yuv',
				presenterWav: '/tmp/presenter.wav',
				presenterPesqWav: '/tmp/presenter-pesq.wav',
			},
			'/tmp/work',
			{
				rawDir: '/tmp/ocr_raw',
				fullDir: '/tmp/ocr_full',
			},
			150,
		);

		expect(result).toMatchObject({
			cut_index: 1,
			vmaf: 0.8,
			visqol: 1,
			msssim: 3,
			psnr: 3,
			psnrhvs: 3,
			ssim: 3,
			vifp: 3,
			psnrhvsm: 3,
			pesq: 0.625,
		});
	});
});
