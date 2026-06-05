import {
	describe,
	it,
	beforeEach,
	afterEach,
	afterAll,
	beforeAll,
} from 'vitest';
import { startServer } from '../../src/app.js';
import type { Application } from 'express';
import { StartedS3MockContainer } from '@testcontainers/s3mock';
import { StartedElasticsearchContainer } from '@testcontainers/elasticsearch';
import { S3Client } from '@aws-sdk/client-s3';
import {
	run2BrowserTest,
	setupS3MockContainer,
	cleanBucket,
	generateBucketName,
	generateIndexName,
	expectCorrectElasticSearchDocuments,
	assertSessionStats,
	assertS3SessionStats,
	cleanupServer,
	setupServerPorts,
} from './e2e-test-utils.js';
import { stopS3MockTestContainer } from '../utils/s3-utils.js';
import {
	startElasticSearchTestContainer,
	stopElasticSearchTestContainer,
} from '../utils/elasticsearch-testcontainer-utils.js';

let app: Application;

let s3MockContainer: StartedS3MockContainer;
let testBucketName = 'test-bucket';
let s3Client: S3Client;

let elasticsearchContainer: StartedElasticsearchContainer;
let elkIndex = 'test-index';

beforeAll(async () => {
	const [s3Setup, startedElasticsearchContainer] = await Promise.all([
		setupS3MockContainer(),
		startElasticSearchTestContainer(),
	]);

	s3MockContainer = s3Setup.s3MockContainer;
	s3Client = s3Setup.s3Client;
	elasticsearchContainer = startedElasticsearchContainer;
}, 600000);

afterAll(async () => {
	await Promise.all([
		stopS3MockTestContainer(s3MockContainer),
		stopElasticSearchTestContainer(elasticsearchContainer),
	]);
}, 180000);

beforeEach(async () => {
	await setupServerPorts();
}, 30000);

afterEach(async () => {
	await cleanupServer();
}, 30000);

// IMPORTANT: This test assumes there is a LiveKit server running and accessible with the credentials specified in test configs
describe('Browser-emulator - External containers (S3 & Elasticsearch)', () => {
	describe('LiveKit + S3', () => {
		beforeEach(async () => {
			testBucketName = generateBucketName();
			process.env.COM_MODULE = 'livekit';
			({ app } = await startServer());
		});

		afterEach(async () => {
			await cleanBucket(s3Client, testBucketName);
		});

		it(
			'LiveKit basic workflow + S3 (Chrome with S3)',
			{ repeats: 0 },
			async () => {
				const sessionName = await run2BrowserTest(
					app,
					'livekit',
					'chrome',
					10,
					true,
					false,
					false,
					s3MockContainer,
					s3Client,
				);
				await assertSessionStats(sessionName);
				await assertS3SessionStats(
					s3Client,
					'test-bucket',
					sessionName,
				);
			},
		);

		it(
			'LiveKit basic workflow + S3 (Firefox with S3)',
			{ repeats: 0 },
			async () => {
				const sessionName = await run2BrowserTest(
					app,
					'livekit',
					'firefox',
					10,
					true,
					false,
					false,
					s3MockContainer,
					s3Client,
				);
				await assertSessionStats(sessionName);
				await assertS3SessionStats(
					s3Client,
					'test-bucket',
					sessionName,
				);
			},
		);
	});

	describe('LiveKit + S3 + ELK', () => {
		beforeEach(async () => {
			testBucketName = generateBucketName();
			elkIndex = generateIndexName();
			process.env.COM_MODULE = 'livekit';
			({ app } = await startServer());
		});

		afterEach(async () => {
			await cleanBucket(s3Client, testBucketName);
		});

		it('LiveKit basic workflow + S3+ELK (Chrome with ELK)', async () => {
			const sessionName = await run2BrowserTest(
				app,
				'livekit',
				'chrome',
				10,
				true,
				true,
				false,
				s3MockContainer,
				s3Client,
				elasticsearchContainer,
				elkIndex,
			);

			await assertSessionStats(sessionName);
			await assertS3SessionStats(s3Client, 'test-bucket', sessionName);
			await expectCorrectElasticSearchDocuments(
				elasticsearchContainer,
				elkIndex,
			);
		});

		it('LiveKit basic workflow + S3+ELK (Firefox with ELK)', async () => {
			const sessionName = await run2BrowserTest(
				app,
				'livekit',
				'firefox',
				10,
				true,
				true,
				false,
				s3MockContainer,
				s3Client,
				elasticsearchContainer,
				elkIndex,
			);
			await assertSessionStats(sessionName);
			await assertS3SessionStats(s3Client, 'test-bucket', sessionName);
			await expectCorrectElasticSearchDocuments(
				elasticsearchContainer,
				elkIndex,
			);
		});
	});
});
