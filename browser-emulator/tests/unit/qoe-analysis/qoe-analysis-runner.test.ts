import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_CWD } from '../../setup/unit/global-fs-setup.ts';

const getContainerMock = vi.hoisted(() => vi.fn());
const getTimestampsMock = vi.hoisted(() =>
	vi.fn(() => Promise.resolve([] as unknown[])),
);
const processAndUploadResultsMock = vi.hoisted(() =>
	vi.fn(() => Promise.resolve()),
);
const processFilesAndUploadResultsMock = vi.hoisted(() =>
	vi.fn(() => Promise.resolve()),
);

vi.mock('../../../src/container.js', () => ({
	getContainer: getContainerMock,
}));
vi.mock('../../../src/services/qoe-analysis/qoe-command-runner.ts', () => ({}));
vi.mock('../../../src/services/qoe-analysis/qoe-results-ingestion.ts', () => ({
	getTimestamps: getTimestampsMock,
	processAndUploadResults: processAndUploadResultsMock,
	processFilesAndUploadResults: processFilesAndUploadResultsMock,
}));

import {
	processFilesAndUploadResults,
	runQoEAnalysisBlocking,
	runQoEAnalysisNonBlocking,
} from '../../../src/services/qoe-analysis/qoe-analysis-runner.ts';

describe('qoe-analysis-runner', () => {
	const analyzeFileMock = vi.fn(() => Promise.resolve());
	const elasticSearchService = {
		isElasticSearchRunning: vi.fn(() => false),
		initialize: vi.fn(() => Promise.resolve()),
	};
	const configureQoeGlobalLimiterMock = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vol.mkdirSync(`${MOCK_CWD}/recordings/qoe`, { recursive: true });
		getContainerMock.mockResolvedValue({
			resolve: (name: string) => {
				if (name === 'qoeAnalyzerService') {
					return { analyzeFile: analyzeFileMock };
				}
				if (name === 'elasticSearchService') {
					return elasticSearchService;
				}
				if (name === 'qoeCommandRunner') {
					return {
						configureQoeGlobalLimiter:
							configureQoeGlobalLimiterMock,
					};
				}
				throw new Error(`Unexpected resolution: ${name}`);
			},
		});
	});

	it('runs blocking analysis only for .webm files', async () => {
		vol.fromJSON({
			[`${MOCK_CWD}/recordings/qoe/QOE_s_u1_u2.webm`]: 'video',
			[`${MOCK_CWD}/recordings/qoe/.gitkeep`]: 'text',
		});

		await runQoEAnalysisBlocking(
			{
				fragment_duration: 5,
				padding_duration: 1,
				framerate: 30,
				width: 640,
				height: 480,
				presenter_audio_file_location: '/tmp/presenter.wav',
				presenter_video_file_location: '/tmp/presenter.y4m',
			},
			{ maxCpus: 4, onlyFiles: true },
		);

		expect(configureQoeGlobalLimiterMock).toHaveBeenCalledWith(4);
		expect(analyzeFileMock).toHaveBeenCalledTimes(1);
		expect(analyzeFileMock).toHaveBeenCalledWith(
			expect.objectContaining({
				viewerPath: expect.stringContaining('.webm'),
			}),
		);
		expect(getTimestampsMock).not.toHaveBeenCalled();
		expect(processAndUploadResultsMock).not.toHaveBeenCalled();
	});

	it('uploads results in blocking mode when onlyFiles is false', async () => {
		const elasticPassword = process.env.ELASTICSEARCH_PASSWORD ?? '';
		vol.fromJSON({
			[`${MOCK_CWD}/recordings/qoe/QOE_s_u1_u2.webm`]: 'video',
			[`${MOCK_CWD}/v-s-u1-u2_cuts.json`]:
				'[{"cut_index":0,"vmaf":0.8,"visqol":0.7}]',
		});
		getTimestampsMock.mockResolvedValueOnce([
			{
				new_participant_session: 's',
				new_participant_id: 'u1',
				'@timestamp': '2026-01-01T00:00:00.000Z',
			},
		] as unknown[]);

		await runQoEAnalysisBlocking({
			fragment_duration: 5,
			padding_duration: 1,
			framerate: 30,
			width: 640,
			height: 480,
			presenter_audio_file_location: '/tmp/presenter.wav',
			presenter_video_file_location: '/tmp/presenter.y4m',
			elasticsearch_hostname: 'localhost',
			elasticsearch_username: 'elastic',
			elasticsearch_password: elasticPassword,
			index: 'webrtc-test',
		});

		expect(elasticSearchService.initialize).toHaveBeenCalledTimes(1);
		expect(getTimestampsMock).toHaveBeenCalledTimes(1);
		expect(processAndUploadResultsMock).toHaveBeenCalledTimes(1);
	});

	it('starts non-blocking analysis and triggers completion callback', async () => {
		vol.fromJSON({
			[`${MOCK_CWD}/recordings/qoe/QOE_s_u1_u2.webm`]: 'video',
			[`${MOCK_CWD}/v-s-u1-u2_cuts.json`]:
				'[{"cut_index":0,"vmaf":0.8,"visqol":0.7}]',
		});
		const onCompleted = vi.fn();

		const files = await runQoEAnalysisNonBlocking(
			{
				fragment_duration: 5,
				padding_duration: 1,
				framerate: 30,
				width: 640,
				height: 480,
				presenter_audio_file_location: '/tmp/presenter.wav',
				presenter_video_file_location: '/tmp/presenter.mp4',
			},
			{},
			{ onCompleted },
		);

		expect(files).toContain('QOE_s_u1_u2.webm');
		for (let i = 0; i < 20; i++) {
			if (onCompleted.mock.calls.length > 0) {
				break;
			}
			await new Promise(resolve => setTimeout(resolve, 5));
		}
		expect(onCompleted).toHaveBeenCalledTimes(1);
	});

	it('re-exports processFilesAndUploadResults', async () => {
		await processFilesAndUploadResults({} as never, '/tmp');
		expect(processFilesAndUploadResultsMock).toHaveBeenCalledWith(
			{},
			'/tmp',
		);
	});
});
