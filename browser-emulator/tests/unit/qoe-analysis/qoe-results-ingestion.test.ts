import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_CWD } from '../../setup/unit/global-fs-setup.ts';

const getContainerMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/container.js', () => ({
	getContainer: getContainerMock,
}));

import {
	getTimestamps,
	processAndUploadResults,
	processFilesAndUploadResults,
} from '../../../src/services/qoe-analysis/qoe-results-ingestion.ts';

describe('qoe-results-ingestion', () => {
	const elasticPassword = process.env.ELASTICSEARCH_PASSWORD ?? '';
	const elasticSearchService = {
		initialize: vi.fn(() => Promise.resolve()),
		getStartTimes: vi.fn<() => Promise<unknown[]>>(() =>
			Promise.resolve([
				{
					new_participant_session: 's',
					new_participant_id: 'u1',
					'@timestamp': '2026-01-01T00:00:00.000Z',
				},
				{
					new_participant_session: 's',
					new_participant_id: 'u2',
					'@timestamp': '2026-01-01T00:00:01.000Z',
				},
			]),
		),
		sendBulkJsons: vi.fn<
			(payload: Record<string, unknown>[]) => Promise<void>
		>(() => Promise.resolve()),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		getContainerMock.mockResolvedValue({
			resolve: (name: string) => {
				if (name === 'elasticSearchService') {
					return elasticSearchService;
				}
				throw new Error(`Unexpected resolution: ${name}`);
			},
		});
	});

	it('returns inline timestamps when present', async () => {
		const timestamps = await getTimestamps({
			timestamps: [
				{
					new_participant_session: 'x',
					new_participant_id: 'y',
					'@timestamp': '2026-01-01T00:00:00.000Z',
				},
			],
		} as never);

		expect(timestamps).toHaveLength(1);
		expect(elasticSearchService.getStartTimes).not.toHaveBeenCalled();
	});

	it('loads timestamps from elastic when not provided', async () => {
		const timestamps = await getTimestamps({} as never);
		expect(timestamps).toHaveLength(2);
		expect(elasticSearchService.getStartTimes).toHaveBeenCalledTimes(1);
	});

	it('processes JSON cuts and sends bulk payload', async () => {
		await processAndUploadResults(
			[
				{
					new_participant_session: 's',
					new_participant_id: 'u1',
					'@timestamp': '2026-01-01T00:00:00.000Z',
				},
				{
					new_participant_session: 's',
					new_participant_id: 'u2',
					'@timestamp': '2026-01-01T00:00:01.000Z',
				},
			],
			[
				[
					's',
					'u1',
					'u2',
					JSON.stringify([{ cut_index: 0, vmaf: 0.8, visqol: 0.7 }]),
				],
			],
			{
				fragment_duration: 2,
				padding_duration: 1,
			} as never,
		);

		expect(elasticSearchService.sendBulkJsons).toHaveBeenCalledTimes(1);
		const safePayload = elasticSearchService.sendBulkJsons.mock.calls[0][0];
		expect(safePayload).toHaveLength(1);
		expect(safePayload[0]).toMatchObject({
			session: 's',
			userFrom: 'u1',
			userTo: 'u2',
			cut_index: 0,
			vmaf: 0.8,
		});
	});

	it('processes *_cuts.json files and uploads results', async () => {
		vol.fromJSON({
			[`${MOCK_CWD}/v-s-u1-u2_cuts.json`]:
				'[{"cut_index":0,"vmaf":0.8,"visqol":0.7}]',
			[`${MOCK_CWD}/ignore.json`]: '{"k":1}',
		});

		await processFilesAndUploadResults({
			elasticsearch_hostname: 'localhost',
			elasticsearch_username: 'elastic',
			elasticsearch_password: elasticPassword,
			index: 'idx',
			fragment_duration: 5,
			padding_duration: 1,
		} as never);

		expect(elasticSearchService.initialize).toHaveBeenCalledTimes(1);
		expect(elasticSearchService.sendBulkJsons).toHaveBeenCalledTimes(1);
	});
});
