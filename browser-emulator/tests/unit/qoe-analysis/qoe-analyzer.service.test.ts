import fsPromises from 'node:fs/promises';
import os from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_CWD } from '../../setup/unit/global-fs-setup.ts';

const preparePresenterArtifactsMock = vi.hoisted(() => vi.fn());
const fixVideoResolutionMock = vi.hoisted(() => vi.fn());
const detectCutWindowsAndPrepareOcrFramesMock = vi.hoisted(() => vi.fn());
const validateQoeDependenciesMock = vi.hoisted(() => vi.fn());
const runCutAnalysisMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/qoe-analysis/qoe-artifact-preparer.ts', () => ({
	preparePresenterArtifacts: preparePresenterArtifactsMock,
	fixVideoResolution: fixVideoResolutionMock,
}));
vi.mock(
	'../../../src/services/qoe-analysis/qoe-cut-window-detector.ts',
	() => ({
		detectCutWindowsAndPrepareOcrFrames:
			detectCutWindowsAndPrepareOcrFramesMock,
	}),
);
vi.mock(
	'../../../src/services/qoe-analysis/qoe-dependency-validator.ts',
	() => ({
		validateQoeDependencies: validateQoeDependenciesMock,
	}),
);
vi.mock('../../../src/services/qoe-analysis/qoe-metrics.ts', () => ({
	runCutAnalysis: runCutAnalysisMock,
}));

import { QoeAnalyzerService } from '../../../src/services/qoe-analysis/qoe-analyzer.service.ts';

describe('QoeAnalyzerService', () => {
	const tmpRoot = `${MOCK_CWD}/tmp`;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.spyOn(os, 'tmpdir').mockReturnValue(tmpRoot);
		await fsPromises.mkdir(tmpRoot, { recursive: true });

		preparePresenterArtifactsMock.mockResolvedValue({
			presenterYuv: '/tmp/presenter.yuv',
			presenterWav: '/tmp/presenter.wav',
			presenterPesqWav: '/tmp/presenter-pesq.wav',
		});
		detectCutWindowsAndPrepareOcrFramesMock.mockResolvedValue({
			windows: [
				{ cutIndex: 0, startSeconds: 1, endSeconds: 2 },
				{ cutIndex: 1, startSeconds: 3, endSeconds: 4 },
			],
		});
		runCutAnalysisMock
			.mockResolvedValueOnce({ cut_index: 0, vmaf: 0.8, visqol: 0.7 })
			.mockResolvedValueOnce({ cut_index: 1, vmaf: 0.9, visqol: 0.75 });
	});

	it('analyzes all cuts and writes output json', async () => {
		const service = new QoeAnalyzerService({ run: vi.fn() } as never);

		await service.analyzeFile({
			viewerPath: '/tmp/viewer.webm',
			presenterPath: '/tmp/presenter.mp4',
			presenterAudioPath: '/tmp/presenter.wav',
			prefix: 'v-s-u1-u2',
			fragmentDurationSecs: 5,
			paddingDurationSecs: 1,
			width: 640,
			height: 480,
			fps: 30,
			qoeConfig: { allAnalysis: true, debug: false },
		});

		expect(validateQoeDependenciesMock).toHaveBeenCalledWith(
			expect.anything(),
			true,
		);
		expect(preparePresenterArtifactsMock).toHaveBeenCalledTimes(1);
		expect(fixVideoResolutionMock).toHaveBeenCalledTimes(1);
		expect(detectCutWindowsAndPrepareOcrFramesMock).toHaveBeenCalledTimes(
			1,
		);
		expect(runCutAnalysisMock).toHaveBeenCalledTimes(2);

		const outputJson = await fsPromises.readFile(
			`${MOCK_CWD}/v-s-u1-u2_cuts.json`,
			'utf-8',
		);
		expect(JSON.parse(outputJson)).toEqual([
			{ cut_index: 0, vmaf: 0.8, visqol: 0.7 },
			{ cut_index: 1, vmaf: 0.9, visqol: 0.75 },
		]);

		const tmpDirs = await fsPromises.readdir(tmpRoot);
		expect(tmpDirs).toHaveLength(0);
	});

	it('keeps temp directory when debug is enabled', async () => {
		const service = new QoeAnalyzerService({ run: vi.fn() } as never);

		await service.analyzeFile({
			viewerPath: '/tmp/viewer.webm',
			presenterPath: '/tmp/presenter.mp4',
			presenterAudioPath: '/tmp/presenter.wav',
			prefix: 'v-s-u1-u2',
			fragmentDurationSecs: 5,
			paddingDurationSecs: 1,
			width: 640,
			height: 480,
			fps: 30,
			qoeConfig: { allAnalysis: false, debug: true },
		});

		const tmpDirs = await fsPromises.readdir(tmpRoot);
		expect(tmpDirs.length).toBeGreaterThan(0);
		expect(tmpDirs.some(dir => dir.startsWith('qoe-v-s-u1-u2-'))).toBe(
			true,
		);
	});
});
