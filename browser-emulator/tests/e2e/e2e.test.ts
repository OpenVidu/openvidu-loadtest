import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	afterAll,
	beforeAll,
} from 'vitest';
import request from 'supertest';
import { startServer, stopServer } from '../../src/app.js';
import type { Application } from 'express';
import { createServer } from 'node:http';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
	AvailableBrowsers,
	Resolution,
} from '../../src/types/create-user.type.js';
import { LocalFilesRepository } from '../../src/repositories/files/local-files.repository.js';
import {
	BrowserVideo,
	InitializePost,
} from '../../src/types/initialize.type.js';
import {
	listBucketObjects,
	startS3MockTestContainer,
	stopS3MockTestContainer,
} from '../utils/s3-utils.js';
import { StartedS3MockContainer } from '@testcontainers/s3mock';
import {
	DeleteBucketCommand,
	DeleteObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { QoeAnalysisStatus } from '../../src/types/qoe.type.js';
import { StartedElasticsearchContainer } from '@testcontainers/elasticsearch';
import {
	startElasticSearchTestContainer,
	stopElasticSearchTestContainer,
} from '../utils/elasticsearch-testcontainer-utils.js';
import { Client } from '@elastic/elasticsearch';

const QOE_ANALYSIS_TIMEOUT_MS = 30 * 60 * 1000;
const QOE_ANALYSIS_POLL_INTERVAL_MS = 2000;
const EXPECTED_STATS_FILES = [
	'connections.json',
	'events.json',
	'stats.json',
	'errors.json',
];

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

async function getAvailablePort(): Promise<number> {
	return new Promise(resolve => {
		const server = createServer();
		server.listen(0, () => {
			const port = (server.address() as { port: number }).port;
			server.close(() => resolve(port));
		});
	});
}

async function deleteAllFilesFromDir(dir: string) {
	for (const file of await fsPromises.readdir(dir)) {
		if (file !== '.gitkeep') {
			const filePath = path.join(dir, file);
			await fsPromises.rm(filePath, { recursive: true, force: true });
		}
	}
}

async function pathExists(filePath: string): Promise<boolean> {
	return fsPromises
		.access(filePath)
		.then(() => true)
		.catch(() => false);
}

async function createPublisherUser(
	sessionName: string,
	userId: string,
	expectedParticipants: number,
	expectedStreams: number,
	browser: AvailableBrowsers = 'chrome',
	mediaRecorders = false,
) {
	const createUserResponse = await request(app)
		.post('/openvidu-browser/streamManager')
		.send({
			openviduUrl: 'https://localhost',
			openviduSecret: 'vagrant',
			properties: {
				userId,
				sessionName: sessionName,
				role: 'PUBLISHER',
				audio: true,
				video: true,
				resolution: Resolution.DEFAULT,
				framerate: 30,
				showVideoElements: true,
				browser,
				mediaRecorders,
			},
		});

	expect(createUserResponse.status).toBe(200);
	expect(createUserResponse.body).toStrictEqual({
		connectionId: expect.any(String),
		streams: expectedStreams,
		participants: expectedParticipants,
		workerCpuUsage: expect.any(Number),
		sessionId: sessionName,
		userId,
	});
}

async function assertUserStats(statsDir: string, userId: string) {
	const userStatsDir = path.join(statsDir, userId);
	const userDirExists = await pathExists(userStatsDir);
	expect(userDirExists).toBe(true);

	const userStatsFiles = await fsPromises.readdir(userStatsDir);
	expect(userStatsFiles.length).toBe(EXPECTED_STATS_FILES.length);
	for (const expectedFile of EXPECTED_STATS_FILES) {
		expect(userStatsFiles).toContain(expectedFile);
	}

	for (const file of userStatsFiles) {
		const filePath = path.join(userStatsDir, file);
		const fileContent = await fsPromises.readFile(filePath, 'utf-8');
		expect(fileContent.length).toBeGreaterThan(0);
	}
}

async function pingInstance() {
	const pingResponse = await request(app).get('/instance/ping');
	expect(pingResponse.status).toBe(200);
}

async function initializeInstance(
	enableS3 = false,
	enableElasticsearch = false,
) {
	const browserVideo: BrowserVideo = {
		videoType: 'bunny',
		videoInfo: {
			width: 640,
			height: 480,
			fps: 30,
		},
	};
	let initializeRequest: InitializePost;
	if (enableElasticsearch) {
		initializeRequest = {
			browserVideo,
			vnc: true,
			elasticSearchHost: elasticsearchContainer.getHttpUrl(),
			elasticSearchUserName: elasticsearchContainer.getUsername(),
			elasticSearchPassword: elasticsearchContainer.getPassword(),
			elasticSearchIndex: elkIndex,
		};
	} else {
		initializeRequest = {
			browserVideo,
			vnc: true,
		};
	}
	if (enableS3) {
		initializeRequest.s3HostAccessKey = s3MockContainer.getAccessKeyId();
		initializeRequest.s3HostSecretAccessKey =
			s3MockContainer.getSecretAccessKey();
		initializeRequest.s3BucketName = testBucketName;
		initializeRequest.s3Host = s3MockContainer.getHttpConnectionUrl();
	}

	const initializeResponse = await request(app)
		.post('/instance/initialize')
		.send(initializeRequest);

	expect(initializeResponse.status).toBe(200);
	expect(initializeResponse.text).toContain('Instance');
	expect(initializeResponse.text).toContain('has been initialized');
}

async function createTwoPublisherUsers(
	sessionName: string,
	browser: AvailableBrowsers,
	mediaRecorders = false,
) {
	await createPublisherUser(
		sessionName,
		'User1',
		1,
		1,
		browser,
		mediaRecorders,
	);
	await createPublisherUser(
		sessionName,
		'User2',
		2,
		4,
		browser,
		mediaRecorders,
	);
}

async function cleanBucket(s3Client: S3Client, testBucketName: string) {
	const uploadedKeys = await listBucketObjects(s3Client, testBucketName);
	for (const key of uploadedKeys) {
		await s3Client.send(
			new DeleteObjectCommand({
				Bucket: testBucketName,
				Key: key,
			}),
		);
	}
	// Clean up bucket after each test
	await s3Client.send(
		new DeleteBucketCommand({
			Bucket: testBucketName,
		}),
	);
}

async function waitForBrowsersToSendStats(emulationDuration: number) {
	console.log(
		`Wait ${emulationDuration} seconds to let the browsers connect and send stats`,
	);
	await new Promise(resolve => setTimeout(resolve, emulationDuration * 1000));
}

async function cleanUsers() {
	const deleteAllUsersResponse = await request(app).delete(
		'/openvidu-browser/streamManager',
	);
	expect(deleteAllUsersResponse.status).toBe(200);
	expect(deleteAllUsersResponse.text).toContain('Instance');
	expect(deleteAllUsersResponse.text).toContain('is clean');
}

async function runQoeAnalysisAndWaitUntilFinished() {
	const startResponse = await request(app).post('/qoe/analysis').send({
		fragmentDuration: 5,
		paddingDuration: 1,
	});
	expect(startResponse.status).toBe(200);

	const startTime = Date.now();
	while (Date.now() - startTime < QOE_ANALYSIS_TIMEOUT_MS) {
		const statusResponse = await request(app).get('/qoe/analysis/status');
		expect(statusResponse.status).toBe(200);

		const statusBody: unknown = statusResponse.body;
		expect(isQoeAnalysisStatusResponse(statusBody)).toBe(true);
		if (!isQoeAnalysisStatusResponse(statusBody)) {
			throw new Error('Invalid QoE analysis status response');
		}

		const remainingFiles = statusBody.remainingFiles;
		if (remainingFiles === 0) {
			return;
		}

		await new Promise(resolve =>
			setTimeout(resolve, QOE_ANALYSIS_POLL_INTERVAL_MS),
		);
	}

	throw new Error(
		`QoE analysis did not finish within ${QOE_ANALYSIS_TIMEOUT_MS} ms`,
	);
}

function isQoeAnalysisStatusResponse(
	value: unknown,
): value is QoeAnalysisStatus {
	return (
		typeof value === 'object' &&
		value !== null &&
		'remainingFiles' in value &&
		typeof (value as { remainingFiles: unknown }).remainingFiles ===
			'number'
	);
}

async function assertSessionStats(sessionName: string) {
	const statsDir = path.join(LocalFilesRepository.STATS_DIR, sessionName);
	const statsDirExists = await pathExists(statsDir);
	expect(statsDirExists).toBe(true);
	await assertUserStats(statsDir, 'User1');
	await assertUserStats(statsDir, 'User2');
}

async function assertS3SessionStats(
	s3Client: S3Client,
	bucketName: string,
	sessionName: string,
) {
	const uploadedKeys = await listBucketObjects(s3Client, bucketName);
	for (const userId of ['User1', 'User2']) {
		for (const expectedFile of EXPECTED_STATS_FILES) {
			const expectedKey = `stats/${sessionName}/${userId}/${expectedFile}`;
			expect(uploadedKeys).toContain(expectedKey);
		}
	}
}

async function assertS3QoeRecordings(
	s3Client: S3Client,
	bucketName: string,
	sessionName: string,
) {
	const uploadedKeys = await listBucketObjects(s3Client, bucketName);
	for (const [from, to] of [
		['User1', 'User2'],
		['User2', 'User1'],
	]) {
		const expectedKey = `QOE_${sessionName}_${from}_${to}.webm`;
		expect(uploadedKeys).toContain(expectedKey);
	}
}

async function run2BrowserTest(
	browser: AvailableBrowsers = 'chrome',
	emulationDuration = 10,
	enableS3 = false,
	enableElasticsearch = false,
	mediaRecorders = false,
	s3Client?: S3Client,
) {
	await pingInstance();
	await initializeInstance(enableS3, enableElasticsearch);
	// Platforms might have some delay in cleaning sessions, so we avoid reusing the same session between tests
	const sessionName = 'LoadTestSession' + Date.now();
	await createTwoPublisherUsers(sessionName, browser, mediaRecorders);
	await waitForBrowsersToSendStats(emulationDuration);
	await cleanUsers();
	if (mediaRecorders) {
		await runQoeAnalysisAndWaitUntilFinished();
	}
	await assertSessionStats(sessionName);
	if (enableS3 && s3Client) {
		await assertS3SessionStats(s3Client, testBucketName, sessionName);
		if (mediaRecorders) {
			await assertS3QoeRecordings(s3Client, testBucketName, sessionName);
		}
	}
}

async function setupS3MockContainer() {
	const s3MockContainer = await startS3MockTestContainer();
	const s3Client = new S3Client({
		endpoint: s3MockContainer.getHttpConnectionUrl(),
		forcePathStyle: true,
		region: 'us-east-1',
		credentials: {
			accessKeyId: s3MockContainer.getAccessKeyId(),
			secretAccessKey: s3MockContainer.getSecretAccessKey(),
		},
	});
	return { s3MockContainer, s3Client };
}

function generateBucketName() {
	return `test-bucket-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function generateIndexName() {
	return `test-index-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

async function expectCorrectElasticSearchDocuments() {
	const client = new Client({
		node: elasticsearchContainer.getHttpUrl(),
		auth: {
			username: elasticsearchContainer.getUsername(),
			password: elasticsearchContainer.getPassword(),
		},
	});
	const { hits } = await client.search({
		index: elkIndex,
		query: {
			match_all: {},
		},
		size: 1000,
	});

	expect(
		hits.hits.some(hit => {
			const src = hit._source as Record<string, unknown> | undefined;
			return (
				typeof src === 'object' &&
				src !== null &&
				src.user === 'User1' &&
				Array.isArray(src.webrtcStats) &&
				src.webrtcStats.length > 0
			);
		}),
	).toBe(true);
	expect(
		hits.hits.some(hit => {
			const src = hit._source as Record<string, unknown> | undefined;
			return (
				typeof src === 'object' &&
				src !== null &&
				src.user === 'User2' &&
				Array.isArray(src.webrtcStats) &&
				src.webrtcStats.length > 0
			);
		}),
	).toBe(true);
	expect(
		hits.hits.some(hit => {
			const src = hit._source as Record<string, unknown> | undefined;
			return (
				typeof src === 'object' &&
				src !== null &&
				src.new_participant_id === 'User1'
			);
		}),
	).toBe(true);
	expect(
		hits.hits.some(hit => {
			const src = hit._source as Record<string, unknown> | undefined;
			return (
				typeof src === 'object' &&
				src !== null &&
				src.new_participant_id === 'User2'
			);
		}),
	).toBe(true);
}

beforeEach(async () => {
	const serverPort = await getAvailablePort();
	process.env.SERVER_PORT = String(serverPort);
	({ app } = await startServer());
}, 30000);

afterEach(async () => {
	await stopServer();
	delete process.env.SERVER_PORT;
	await Promise.all([
		deleteAllFilesFromDir(LocalFilesRepository.FULLSCREEN_RECORDING_DIR),
		deleteAllFilesFromDir(LocalFilesRepository.QOE_RECORDING_DIR),
		deleteAllFilesFromDir(LocalFilesRepository.STATS_DIR),
	]);
}, 30000);

// IMPORTANT: This test assumes it is running in a machine with every dependency installed (using all install scripts),
// alongside a local OpenVidu 2 deployment with secret "vagrant".
// Using the vagrant box available in this project should suffice.
describe('Browser-emulator', () => {
	describe('OpenVidu 2', () => {
		// Added repeats to these tests to increase confidence in stability, as browsers can be flaky
		it('basic workflow (Chrome only)', { repeats: 10 }, async () => {
			await run2BrowserTest('chrome');
		});

		it('basic workflow (Firefox only)', { repeats: 10 }, async () => {
			await run2BrowserTest('firefox');
		});
	});

	describe('OpenVidu 2 + S3', () => {
		beforeEach(() => {
			testBucketName = generateBucketName();
		});

		afterEach(async () => {
			await cleanBucket(s3Client, testBucketName);
		});

		it('basic workflow + S3 (Chrome with S3)', { repeats: 0 }, async () => {
			await run2BrowserTest('chrome', 10, true, false, false, s3Client);
		});

		it(
			'basic workflow + S3 (Firefox with S3)',
			{ repeats: 0 },
			async () => {
				await run2BrowserTest(
					'firefox',
					10,
					true,
					false,
					false,
					s3Client,
				);
			},
		);
	});

	describe('OpenVidu 2 + S3 + ELK', () => {
		beforeEach(() => {
			testBucketName = generateBucketName();
			elkIndex = generateIndexName();
		});

		afterEach(async () => {
			await cleanBucket(s3Client, testBucketName);
		});
		it('basic workflow + S3+ELK (Chrome with ELK)', async () => {
			await run2BrowserTest('chrome', 10, true, true, false, s3Client);
			await expectCorrectElasticSearchDocuments();
		});

		it('basic workflow + S3+ELK (Firefox with ELK)', async () => {
			await run2BrowserTest('firefox', 10, true, true, false, s3Client);
			await expectCorrectElasticSearchDocuments();
		});
	});

	describe('OpenVidu 2 + S3 + ELK + MediaRecorders + QoE Analysis', () => {
		beforeEach(() => {
			testBucketName = generateBucketName();
			elkIndex = generateIndexName();
		});

		afterEach(async () => {
			await cleanBucket(s3Client, testBucketName);
		});
		it('basic workflow + S3+ELK+QoE (Chrome with media recorders)', async () => {
			await run2BrowserTest('chrome', 30, true, true, true, s3Client);
			await expectCorrectElasticSearchDocuments();
		});

		it('basic workflow + S3+ELK+QoE (Firefox with media recorders)', async () => {
			await run2BrowserTest('firefox', 30, true, true, true, s3Client);
			await expectCorrectElasticSearchDocuments();
		});
	});
});
