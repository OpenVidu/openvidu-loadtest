import { expect } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createServer } from 'node:http';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import Docker from 'dockerode';
import {
	AvailableBrowsers,
	Resolution,
} from '../../src/types/create-user.type.js';
import { LocalFilesRepository } from '../../src/repositories/files/local-files.repository.js';
import {
	BrowserVideo,
	InitializePost,
} from '../../src/types/initialize.type.js';
import { getConfig } from '../utils/test-config.js';
import { QoeAnalysisStatus } from '../../src/types/qoe.type.js';
import {
	S3Client,
	DeleteObjectCommand,
	DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { Client } from '@elastic/elasticsearch';
import {
	startS3MockTestContainer,
	listBucketObjects,
} from '../utils/s3-utils.js';
import type { StartedS3MockContainer } from '@testcontainers/s3mock';
import type { StartedElasticsearchContainer } from '@testcontainers/elasticsearch';
import { stopServer } from '../../src/app.js';

// Constants
export const QOE_ANALYSIS_TIMEOUT_MS = 30 * 60 * 1000;
export const QOE_ANALYSIS_POLL_INTERVAL_MS = 2000;
export const MIN_EMULATED_LIVEKIT_DURATION_SECONDS = 10;
export const EXPECTED_STATS_FILES = [
	'connections.json',
	'events.json',
	'stats.json',
	'errors.json',
];

// Types
export interface S3Setup {
	s3MockContainer: StartedS3MockContainer;
	s3Client: S3Client;
}

// Utility functions
export async function findSingleAvailablePort(): Promise<number> {
	return new Promise(resolve => {
		const server = createServer();
		server.listen(0, () => {
			const port = (server.address() as { port: number }).port;
			server.close(() => resolve(port));
		});
	});
}

export async function getAvailablePorts(): Promise<[number, number]> {
	const firstPort = await findSingleAvailablePort();
	let secondPort = await findSingleAvailablePort();

	while (secondPort === firstPort) {
		secondPort = await findSingleAvailablePort();
	}

	return [firstPort, secondPort];
}

export async function deleteAllFilesFromDir(dir: string) {
	for (const file of await fsPromises.readdir(dir)) {
		if (file !== '.gitkeep') {
			const filePath = path.join(dir, file);
			await fsPromises.rm(filePath, { recursive: true, force: true });
		}
	}
}

export async function pathExists(filePath: string): Promise<boolean> {
	return fsPromises
		.access(filePath)
		.then(() => true)
		.catch(() => false);
}

export async function pingInstance(app: Application) {
	const pingResponse = await request(app).get('/instance/ping');
	expect(pingResponse.status).toBe(200);
}

export async function initializeInstance(
	app: Application,
	enableS3 = false,
	enableElasticsearch = false,
	s3MockContainer?: StartedS3MockContainer,
	elasticsearchContainer?: StartedElasticsearchContainer,
	elkIndex?: string,
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
	if (enableElasticsearch && elasticsearchContainer && elkIndex) {
		initializeRequest = {
			browserVideo,
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
	if (enableS3 && s3MockContainer) {
		initializeRequest.s3HostAccessKey = s3MockContainer.getAccessKeyId();
		initializeRequest.s3HostSecretAccessKey =
			s3MockContainer.getSecretAccessKey();
		initializeRequest.s3BucketName = 'test-bucket';
		initializeRequest.s3Host = s3MockContainer.getHttpConnectionUrl();
	}

	const initializeResponse = await request(app)
		.post('/instance/initialize')
		.send(initializeRequest);

	expect(initializeResponse.status).toBe(200);
	expect(initializeResponse.text).toContain('Instance');
	expect(initializeResponse.text).toContain('has been initialized');
}

export async function createPublisherUser(
	app: Application,
	platform: 'openvidu' | 'livekit',
	sessionName: string,
	userId: string,
	expectedParticipants: number,
	expectedStreams: number,
	browser: AvailableBrowsers = 'chrome',
	mediaRecorders = false,
) {
	const openViduConfig = getConfig();
	const requestBody = {
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
	};
	if (platform === 'livekit') {
		Object.assign(requestBody, {
			openviduUrl: openViduConfig.livekitUrl,
			livekitApiKey: openViduConfig.livekitApiKey,
			livekitApiSecret: openViduConfig.livekitApiSecret,
		});
	} else {
		Object.assign(requestBody, {
			openviduUrl: openViduConfig.openviduUrl,
			openviduSecret: openViduConfig.openviduSecret,
		});
	}
	const createUserResponse = await request(app)
		.post('/openvidu-browser/streamManager')
		.send(requestBody);

	expect(createUserResponse.body).toStrictEqual({
		connectionId: expect.any(String),
		streams: expectedStreams,
		participants: expectedParticipants,
		workerCpuUsage: expect.any(Number),
		sessionId: sessionName,
		userId,
	});
	expect(createUserResponse.status).toBe(200);
}

export async function assertUserStats(statsDir: string, userId: string) {
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

export async function assertSessionStats(sessionName: string) {
	const statsDir = path.join(LocalFilesRepository.STATS_DIR, sessionName);
	const statsDirExists = await pathExists(statsDir);
	expect(statsDirExists).toBe(true);
	await assertUserStats(statsDir, 'User1');
	await assertUserStats(statsDir, 'User2');
}

export async function createTwoPublisherUsers(
	app: Application,
	platform: 'openvidu' | 'livekit',
	sessionName: string,
	browser: AvailableBrowsers = 'chrome',
	mediaRecorders = false,
) {
	await createPublisherUser(
		app,
		platform,
		sessionName,
		'User1',
		1,
		1,
		browser,
		mediaRecorders,
	);
	await createPublisherUser(
		app,
		platform,
		sessionName,
		'User2',
		2,
		4,
		browser,
		mediaRecorders,
	);
}

export async function waitForBrowsersToSendStats(emulationDuration: number) {
	console.log(
		`Wait ${emulationDuration} seconds to let the browsers connect and send stats`,
	);
	await new Promise(resolve => setTimeout(resolve, emulationDuration * 1000));
}

export async function assertNoLiveKitCliUnpublishedTracks(sessionName: string) {
	const docker = new Docker();
	const sessionPrefix = `/lk-emulated-${sessionName}-`;
	const containers = (await docker.listContainers({ all: true })).filter(
		containerInfo =>
			containerInfo.Names.some(name => name.startsWith(sessionPrefix)),
	);

	expect(containers.length).toBeGreaterThan(0);

	for (const containerInfo of containers) {
		const container = docker.getContainer(containerInfo.Id);
		const logsBuffer = await container.logs({
			stdout: true,
			stderr: true,
		});
		const logs = logsBuffer.toString();
		const failingLines = logs
			.split('\n')
			.filter(
				line =>
					line.includes('unpublished track') ||
					line.includes('could not get sample from provider'),
			)
			.join('\n');

		if (failingLines.length > 0) {
			const containerName =
				containerInfo.Names.find(name =>
					name.startsWith(sessionPrefix),
				) ?? containerInfo.Id;
			throw new Error(
				`LiveKit CLI container ${containerName} reported track publication errors:\n${failingLines}`,
			);
		}
	}
}

export async function cleanUsers(app: Application) {
	const deleteAllUsersResponse = await request(app).delete(
		'/openvidu-browser/streamManager',
	);
	expect(deleteAllUsersResponse.status).toBe(200);
	expect(deleteAllUsersResponse.text).toContain('Instance');
	expect(deleteAllUsersResponse.text).toContain('is clean');
}

export function isQoeAnalysisStatusResponse(
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

export async function runQoeAnalysisAndWaitUntilFinished(app: Application) {
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

export async function run2BrowserTest(
	app: Application,
	platform: 'openvidu' | 'livekit',
	browser: AvailableBrowsers = 'chrome',
	emulationDuration = 10,
	enableS3 = false,
	enableElasticsearch = false,
	mediaRecorders = false,
	s3MockContainer?: StartedS3MockContainer,
	s3Client?: S3Client,
	elasticsearchContainer?: StartedElasticsearchContainer,
	elkIndex?: string,
): Promise<string> {
	await pingInstance(app);
	await initializeInstance(
		app,
		enableS3,
		enableElasticsearch,
		s3MockContainer,
		elasticsearchContainer,
		elkIndex,
	);
	// Platforms might have some delay in cleaning sessions, so we avoid reusing the same session between tests
	const sessionName = 'Room' + Date.now();
	await createTwoPublisherUsers(
		app,
		platform,
		sessionName,
		browser,
		mediaRecorders,
	);
	const effectiveDuration =
		platform === 'livekit' && browser === 'emulated'
			? Math.max(emulationDuration, MIN_EMULATED_LIVEKIT_DURATION_SECONDS)
			: emulationDuration;
	await waitForBrowsersToSendStats(effectiveDuration);
	if (platform === 'livekit' && browser === 'emulated') {
		await assertNoLiveKitCliUnpublishedTracks(sessionName);
	}
	await cleanUsers(app);
	if (mediaRecorders) {
		await runQoeAnalysisAndWaitUntilFinished(app);
	}
	if (enableS3 && s3Client) {
		if (mediaRecorders) {
			await assertS3QoeRecordings(s3Client, 'test-bucket', sessionName);
		}
	}
	return sessionName;
}

export async function setupS3MockContainer(): Promise<S3Setup> {
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

export function generateBucketName() {
	return `test-bucket-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function generateIndexName() {
	return `test-index-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export async function assertS3SessionStats(
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

export async function assertS3QoeRecordings(
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

export async function cleanBucket(s3Client: S3Client, testBucketName: string) {
	const uploadedKeys = await listBucketObjects(s3Client, testBucketName);
	if (uploadedKeys.length > 0) {
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
}

export async function expectCorrectElasticSearchDocuments(
	elasticsearchContainer: StartedElasticsearchContainer,
	elkIndex: string,
) {
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

export async function setupServerPorts() {
	const ports = await getAvailablePorts();
	process.env.SERVER_PORT = String(ports[0]);
	process.env.WEBSOCKET_SERVER_PORT = String(ports[1]);
}

export async function cleanupServer() {
	await stopServer();
	delete process.env.SERVER_PORT;
	delete process.env.WEBSOCKET_SERVER_PORT;
	await Promise.all([
		deleteAllFilesFromDir(LocalFilesRepository.FULLSCREEN_RECORDING_DIR),
		deleteAllFilesFromDir(LocalFilesRepository.QOE_RECORDING_DIR),
		deleteAllFilesFromDir(LocalFilesRepository.STATS_DIR),
	]);
}
