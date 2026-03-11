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
import { InitializePost } from '../../src/types/initialize.type.js';
import {
	listBucketObjects,
	startS3MockTestContainer,
	stopS3MockTestContainer,
} from '../utils/s3utils.js';
import { StartedS3MockContainer } from '@testcontainers/s3mock';
import {
	DeleteBucketCommand,
	DeleteObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';

let app: Application;
const EXPECTED_STATS_FILES = [
	'connections.json',
	'events.json',
	'stats.json',
	'errors.json',
];

interface S3AccessInfo {
	s3BucketName: string;
	s3Host: string;
	s3AccessKey: string;
	s3SecretAccessKey: string;
}

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

async function initializeInstance(s3Info?: S3AccessInfo) {
	const initializeRequest: InitializePost = {
		browserVideo: {
			videoType: 'bunny',
			videoInfo: {
				width: 640,
				height: 480,
				fps: 30,
			},
		},
	};
	if (s3Info) {
		initializeRequest.s3HostAccessKey = s3Info.s3AccessKey;
		initializeRequest.s3HostSecretAccessKey = s3Info.s3SecretAccessKey;
		initializeRequest.s3BucketName = s3Info.s3BucketName;
		initializeRequest.s3Host = s3Info.s3Host;
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
) {
	await createPublisherUser(sessionName, 'User1', 1, 1, browser);
	await createPublisherUser(sessionName, 'User2', 2, 4, browser);
}

async function waitForBrowsersToSendStats() {
	console.log('Wait 10 seconds to let the browsers connect and send stats');
	await new Promise(resolve => setTimeout(resolve, 10000));
}

async function cleanUsers() {
	const deleteAllUsersResponse = await request(app).delete(
		'/openvidu-browser/streamManager',
	);
	expect(deleteAllUsersResponse.status).toBe(200);
	expect(deleteAllUsersResponse.text).toContain('Instance');
	expect(deleteAllUsersResponse.text).toContain('is clean');
}

async function assertSessionStats(sessionName: string) {
	const statsDir = path.join(LocalFilesRepository.STATS_DIR, sessionName);
	const statsDirExists = await pathExists(statsDir);
	expect(statsDirExists).toBe(true);
	await assertUserStats(statsDir, 'User1');
	await assertUserStats(statsDir, 'User2');
}

async function run2BrowserTest(
	browser: AvailableBrowsers,
	s3Info?: S3AccessInfo,
) {
	await pingInstance();
	await initializeInstance(s3Info);
	// Platforms might have some delay in cleaning sessions, so we avoid reusing the same session between tests
	const sessionName = 'LoadTestSession' + Date.now();
	await createTwoPublisherUsers(sessionName, browser);
	await waitForBrowsersToSendStats();
	await cleanUsers();
	await assertSessionStats(sessionName);
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
		it(
			'should test basic workflow with Chrome and OpenVidu 2 (ping, initialize instance, start 2 publisher browsers, connect to platform and delete them)',
			{ repeats: 0 },
			async () => {
				await run2BrowserTest('chrome');
			},
		);

		it(
			'should test basic workflow with Firefox and OpenVidu 2 (ping, initialize instance, start 2 publisher browsers, connect to platform and delete them)',
			{ repeats: 0 },
			async () => {
				await run2BrowserTest('firefox');
			},
		);
	});

	describe('OpenVidu 2 + S3', () => {
		let s3MockContainer: StartedS3MockContainer;
		let testBucketName: string;
		let s3Client: S3Client;

		beforeEach(() => {
			testBucketName = `test-bucket-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
		});

		afterEach(async () => {
			const uploadedKeys = await listBucketObjects(
				s3Client,
				testBucketName,
			);
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
		});

		beforeAll(async () => {
			s3MockContainer = await startS3MockTestContainer();
			s3Client = new S3Client({
				endpoint: s3MockContainer.getHttpConnectionUrl(),
				forcePathStyle: true,
				region: 'us-east-1',
				credentials: {
					accessKeyId: s3MockContainer.getAccessKeyId(),
					secretAccessKey: s3MockContainer.getSecretAccessKey(),
				},
			});
		}, 180000);

		afterAll(async () => {
			await stopS3MockTestContainer(s3MockContainer);
		}, 180000);

		it(
			'should test basic workflow with Chrome and OpenVidu 2 (ping, initialize instance, start 2 publisher browsers, connect to platform and delete them), uploading the files to S3',
			{ repeats: 0 },
			async () => {
				await run2BrowserTest('chrome', {
					s3Host: s3MockContainer.getHttpConnectionUrl(),
					s3AccessKey: s3MockContainer.getAccessKeyId(),
					s3SecretAccessKey: s3MockContainer.getSecretAccessKey(),
					s3BucketName: testBucketName,
				});
			},
		);

		it(
			'should test basic workflow with Firefox and OpenVidu 2 (ping, initialize instance, start 2 publisher browsers, connect to platform and delete them), uploading the files to S3',
			{ repeats: 0 },
			async () => {
				await run2BrowserTest('firefox', {
					s3Host: s3MockContainer.getHttpConnectionUrl(),
					s3AccessKey: s3MockContainer.getAccessKeyId(),
					s3SecretAccessKey: s3MockContainer.getSecretAccessKey(),
					s3BucketName: testBucketName,
				});
			},
		);
	});
});
