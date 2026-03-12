import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from 'vitest';
import { Client } from '@elastic/elasticsearch';
import type { StartedElasticsearchContainer } from '@testcontainers/elasticsearch';
import { ElasticSearchService } from '../../src/services/elasticsearch.service.ts';
import type { JSONStreamsInfo } from '../../src/types/json.type.ts';
import {
	startElasticSearchTestContainer,
	stopElasticSearchTestContainer,
} from '../utils/elasticsearch-testcontainer-utils.ts';

function createTestIndexName(): string {
	return `test-loadtest-webrtc-stats-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

describe('ElasticSearchService Integration Tests', () => {
	let elasticSearchContainer: StartedElasticsearchContainer;
	let elasticSearchService: ElasticSearchService;
	let adminClient: Client;

	beforeAll(async () => {
		elasticSearchContainer = await startElasticSearchTestContainer();
		const hostname = elasticSearchContainer.getHttpUrl();
		const username = elasticSearchContainer.getUsername();
		const password = elasticSearchContainer.getPassword();
		adminClient = new Client({
			node: hostname,
			maxRetries: 5,
			requestTimeout: 10000,
			tls: {
				rejectUnauthorized: false,
			},
			auth: {
				username,
				password,
			},
		});
	}, 180000);

	afterAll(async () => {
		if (adminClient) {
			await adminClient.close();
		}
		if (elasticSearchContainer) {
			await stopElasticSearchTestContainer(elasticSearchContainer);
		}
	}, 120000);

	beforeEach(() => {
		elasticSearchService = new ElasticSearchService();
	});

	afterEach(async () => {
		if (!elasticSearchService?.indexName) {
			return;
		}

		try {
			const exists = await adminClient.indices.exists({
				index: elasticSearchService.indexName,
			});
			if (exists) {
				await adminClient.indices.delete({
					index: elasticSearchService.indexName,
				});
			}
		} catch (error) {
			console.error(
				`Error cleaning test index ${elasticSearchService.indexName}:`,
				error,
			);
		}
	}, 120000);

	it('should initialize with valid credentials and explicit index', async () => {
		const testIndex = createTestIndexName();

		await elasticSearchService.initialize(
			elasticSearchContainer.getHttpUrl(),
			elasticSearchContainer.getUsername(),
			elasticSearchContainer.getPassword(),
			testIndex,
		);

		expect(elasticSearchService.isElasticSearchRunning()).toBe(true);
		expect(elasticSearchService.indexName).toBe(testIndex);

		const exists = await adminClient.indices.exists({ index: testIndex });
		expect(exists).toBe(true);
	});

	it('should create an auto-generated index when index name is not provided', async () => {
		await elasticSearchService.initialize(
			elasticSearchContainer.getHttpUrl(),
			elasticSearchContainer.getUsername(),
			elasticSearchContainer.getPassword(),
		);

		expect(elasticSearchService.isElasticSearchRunning()).toBe(true);
		expect(elasticSearchService.indexName).toContain(
			'loadtest-webrtc-stats-',
		);

		const exists = await adminClient.indices.exists({
			index: elasticSearchService.indexName,
		});
		expect(exists).toBe(true);
	});

	it('should store and retrieve stream info documents using sendJson and getStartTimes', async () => {
		const testIndex = createTestIndexName();
		const streamInfo: JSONStreamsInfo = {
			'@timestamp': new Date().toISOString(),
			new_participant_id: 'participant-1',
			new_participant_session: 'session-1',
			node_role: 'PUBLISHER',
			streams: 2,
			worker_name: 'worker-1',
		};

		await elasticSearchService.initialize(
			elasticSearchContainer.getHttpUrl(),
			elasticSearchContainer.getUsername(),
			elasticSearchContainer.getPassword(),
			testIndex,
		);

		await elasticSearchService.sendJson(streamInfo);
		await adminClient.indices.refresh({ index: testIndex });

		const startTimes = await elasticSearchService.getStartTimes();

		expect(startTimes).toHaveLength(1);
		expect(startTimes[0]?.new_participant_id).toBe('participant-1');
		expect(startTimes[0]?.new_participant_session).toBe('session-1');
		expect(startTimes[0]?.streams).toBe(2);
	});

	it('should bulk insert documents using sendBulkJsons', async () => {
		const testIndex = createTestIndexName();
		const now = new Date().toISOString();
		const streamInfos: JSONStreamsInfo[] = [
			{
				'@timestamp': now,
				new_participant_id: 'participant-a',
				new_participant_session: 'session-a',
				node_role: 'SUBSCRIBER',
				streams: 1,
				worker_name: 'worker-a',
			},
			{
				'@timestamp': now,
				new_participant_id: 'participant-b',
				new_participant_session: 'session-b',
				node_role: 'PUBLISHER',
				streams: 3,
				worker_name: 'worker-b',
			},
		];

		await elasticSearchService.initialize(
			elasticSearchContainer.getHttpUrl(),
			elasticSearchContainer.getUsername(),
			elasticSearchContainer.getPassword(),
			testIndex,
		);

		await expect(
			elasticSearchService.sendBulkJsons(streamInfos),
		).resolves.not.toThrow();

		const startTimes = await elasticSearchService.getStartTimes();

		expect(startTimes).toHaveLength(2);
		expect(startTimes.map(item => item.new_participant_id)).toContain(
			'participant-a',
		);
		expect(startTimes.map(item => item.new_participant_id)).toContain(
			'participant-b',
		);
	});

	it('should return empty list from getStartTimes when not initialized', async () => {
		const startTimes = await elasticSearchService.getStartTimes();

		expect(startTimes).toEqual([]);
	});
});
