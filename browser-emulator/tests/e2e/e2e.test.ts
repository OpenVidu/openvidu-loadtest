import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { startServer, stopServer } from '../../src/app.js';
import type { Application } from 'express';
import { createServer } from 'node:http';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { Resolution } from '../../src/types/openvidu.type.js';
import { LocalFilesRepository } from '../../src/repositories/files/local-files.repository.js';

let app: Application;
const EXPECTED_STATS_FILES = [
	'connections.json',
	'events.json',
	'stats.json',
	'errors.json',
];

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
	browser = 'chrome',
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
				const pingResponse = await request(app).get('/instance/ping');
				expect(pingResponse.status).toBe(200);
				const initializeResponse = await request(app)
					.post('/instance/initialize')
					.send({
						browserVideo: {
							videoType: 'bunny',
							videoInfo: {
								width: 640,
								height: 480,
								fps: 30,
							},
						},
					});

				expect(initializeResponse.status).toBe(200);
				expect(initializeResponse.text).toContain('Instance');
				expect(initializeResponse.text).toContain(
					'has been initialized',
				);
				// Platforms might have some delay in cleaning sessions, so we avoid reusing the same session between tests
				const sessionName = 'LoadTestSession' + Date.now();
				await createPublisherUser(sessionName, 'User1', 1, 1);
				await createPublisherUser(sessionName, 'User2', 2, 4);
				console.log(
					'Wait 10 seconds to let the browsers connect and send stats',
				);
				await new Promise(resolve => setTimeout(resolve, 10000));
				const deleteAllUsersResponse = await request(app).delete(
					'/openvidu-browser/streamManager',
				);
				expect(deleteAllUsersResponse.status).toBe(200);
				expect(deleteAllUsersResponse.text).toContain('Instance');
				expect(deleteAllUsersResponse.text).toContain('is clean');

				// Check there is a directory stats for the session
				const statsDir = path.join(
					LocalFilesRepository.STATS_DIR,
					sessionName,
				);
				const statsDirExists = await pathExists(statsDir);
				expect(statsDirExists).toBe(true);
				// TODO: validate JSON structure/content in these stats files.
				await assertUserStats(statsDir, 'User1');
				await assertUserStats(statsDir, 'User2');
			},
		);

		it(
			'should test basic workflow with Firefox and OpenVidu 2 (ping, initialize instance, start 2 publisher browsers, connect to platform and delete them)',
			{ repeats: 0 },
			async () => {
				// IMPORTANT: This test assumes it is running alongside a local OpenVidu 2 deployment with secret vagrant.
				// Using the vagrant box available in this project should suffice.
				const pingResponse = await request(app).get('/instance/ping');
				expect(pingResponse.status).toBe(200);
				const initializeResponse = await request(app)
					.post('/instance/initialize')
					.send({
						browserVideo: {
							videoType: 'bunny',
							videoInfo: {
								width: 640,
								height: 480,
								fps: 30,
							},
						},
					});

				expect(initializeResponse.status).toBe(200);
				expect(initializeResponse.text).toContain('Instance');
				expect(initializeResponse.text).toContain(
					'has been initialized',
				);
				// Platforms might have some delay in cleaning sessions, so we avoid reusing the same session between tests
				const sessionName = 'LoadTestSession' + Date.now();
				await createPublisherUser(
					sessionName,
					'User1',
					1,
					1,
					'firefox',
				);
				await createPublisherUser(
					sessionName,
					'User2',
					2,
					4,
					'firefox',
				);
				console.log(
					'Wait 10 seconds to let the browsers connect and send stats',
				);
				await new Promise(resolve => setTimeout(resolve, 10000));
				const deleteAllUsersResponse = await request(app).delete(
					'/openvidu-browser/streamManager',
				);
				expect(deleteAllUsersResponse.status).toBe(200);
				expect(deleteAllUsersResponse.text).toContain('Instance');
				expect(deleteAllUsersResponse.text).toContain('is clean');

				// Check there is a directory stats for the session
				const statsDir = path.join(
					LocalFilesRepository.STATS_DIR,
					sessionName,
				);
				const statsDirExists = await pathExists(statsDir);
				expect(statsDirExists).toBe(true);
				// TODO: validate JSON structure/content in these stats files.
				await assertUserStats(statsDir, 'User1');
				await assertUserStats(statsDir, 'User2');
			},
		);
	});
});
