import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { startServer, stopServer } from '../../src/app.js';
import type { Application } from 'express';
import { createServer } from 'node:http';
import { FilesRepository } from '../../src/repositories/files/files.repository.js';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

let app: Application;

async function getAvailablePort(): Promise<number> {
	return new Promise(resolve => {
		const server = createServer();
		server.listen(0, () => {
			const port = (server.address() as { port: number }).port;
			server.close(() => resolve(port));
		});
	});
}

beforeEach(async () => {
	const serverPort = await getAvailablePort();
	process.env.SERVER_PORT = String(serverPort);
	({ app } = await startServer());
});

async function deleteAllFilesFromDir(dir: string) {
	for (const file of await fsPromises.readdir(dir)) {
		if (file !== '.gitkeep') {
			const filePath = path.join(dir, file);
			await fsPromises.rm(filePath, { recursive: true, force: true });
		}
	}
}

afterEach(async () => {
	await stopServer();
	delete process.env.SERVER_PORT;
	await Promise.all([
		deleteAllFilesFromDir(FilesRepository.FULLSCREEN_RECORDING_DIR),
		deleteAllFilesFromDir(FilesRepository.QOE_RECORDING_DIR),
		deleteAllFilesFromDir(FilesRepository.STATS_DIR),
		deleteAllFilesFromDir(FilesRepository.MEDIAFILES_DIR),
	]);
});

describe('Browser-emulator', () => {
	it('should ping the instance and return 200 if instance is ready', async () => {
		const response = await request(app).get('/instance/ping');
		expect(response.status).toBe(200);
	});
	it('should initialize instance and return 200', async () => {
		const response = await request(app)
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
				s3BucketName: 'test-bucket',
				awsAccessKey: 'test-access-key',
				awsSecretAccessKey: 'test-secret-access-key',
				qoeAnalysis: {
					enabled: true,
					fragment_duration: 5,
					padding_duration: 2,
				},
			});

		expect(response.status).toBe(200);
		expect(response.text).toContain('Instance');
		expect(response.text).toContain('has been initialized');
	});
});
