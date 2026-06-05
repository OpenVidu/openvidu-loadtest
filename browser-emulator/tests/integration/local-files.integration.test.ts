import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeAllFilesFromDir } from '../utils/files.ts';

function createFakeDownloadStream(fakeContent = 'FAKE_FILE_DATA') {
	const stream = new Readable();
	stream.push(fakeContent);
	stream.push(null); // end
	return stream;
}

function createMockResponseForGet(fakeContent = 'FAKE_FILE_DATA') {
	return {
		statusCode: 200,
		statusMessage: 'OK',
		headers: {},
		pipe: (destination: NodeJS.WritableStream) => {
			createFakeDownloadStream(fakeContent).pipe(destination);
			return destination;
		},
	};
}

function createMockResponseForHead() {
	return {
		statusCode: 200,
		statusMessage: 'OK',
		headers: {},
	};
}

function createMockRequestObject(callback: (response: unknown) => void) {
	return {
		on: vi.fn().mockReturnThis(),
		end: vi.fn(() => {
			callback(createMockResponseForHead());
		}),
	};
}

vi.mock('node:http', async importOriginal => {
	const actual = await importOriginal<typeof import('node:http')>();
	const mockedModule = {
		...actual,
		request: vi.fn(
			(_url, _options, callback: (response: unknown) => void) => {
				return createMockRequestObject(callback);
			},
		),
		get: vi.fn((_url, callback: (response: unknown) => void) => {
			callback(createMockResponseForGet());
			return { on: vi.fn().mockReturnThis() };
		}),
	};
	return {
		...mockedModule,
		default: mockedModule,
	};
});

vi.mock('node:https', async importOriginal => {
	const actual = await importOriginal<typeof import('node:https')>();
	const mockedModule = {
		...actual,
		request: vi.fn(
			(_url, _options, callback: (response: unknown) => void) => {
				return createMockRequestObject(callback);
			},
		),
		get: vi.fn((_url, callback: (response: unknown) => void) => {
			callback(createMockResponseForGet());
			return { on: vi.fn().mockReturnThis() };
		}),
	};
	return {
		...mockedModule,
		default: mockedModule,
	};
});

import { LocalFilesRepository } from '../../src/repositories/files/local-files.repository.ts';
import { LocalFilesService } from '../../src/services/files/local-files.service.ts';
import { BrowserVideo } from '../../src/types/initialize.type.ts';

const VIDEO_PRESETS: BrowserVideo[] = [
	{
		videoType: 'bunny',
		videoInfo: {
			width: 640,
			height: 480,
			fps: 30,
		},
	},
	{
		videoType: 'bunny',
		videoInfo: {
			width: 1280,
			height: 720,
			fps: 30,
		},
	},
	{
		videoType: 'bunny',
		videoInfo: {
			width: 1920,
			height: 1080,
			fps: 30,
		},
	},
	{
		videoType: 'bunny',
		videoInfo: {
			width: 1280,
			height: 720,
			fps: 60,
		},
	},
	{
		videoType: 'bunny',
		videoInfo: {
			width: 640,
			height: 480,
			fps: 60,
		},
	},
	{
		videoType: 'bunny',
		videoInfo: {
			width: 1920,
			height: 1080,
			fps: 60,
		},
	},
	{
		videoType: 'interview',
		videoInfo: {
			width: 640,
			height: 480,
			fps: 30,
		},
	},
	{
		videoType: 'game',
		videoInfo: {
			width: 640,
			height: 480,
			fps: 30,
		},
	},
	{
		videoType: 'custom',
		customVideo: {
			videoUrl:
				'https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny_480p_30fps.y4m',
			audioUrl:
				'https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny.wav',
		},
	},
];

function getExpectedFileNames(videoPreset: BrowserVideo): {
	videoFile: string;
	audioFile: string;
} {
	if (videoPreset.videoType === 'custom') {
		return {
			videoFile: 'fakevideo_custom.y4m',
			audioFile: 'fakeaudio_custom.wav',
		};
	}

	return {
		videoFile: `fakevideo_${videoPreset.videoType}_${videoPreset.videoInfo.fps}fps_${videoPreset.videoInfo.width}x${videoPreset.videoInfo.height}.y4m`,
		audioFile: `fakeaudio_${videoPreset.videoType}.wav`,
	};
}

describe('Local Files Service + Repository Integration Tests', () => {
	let filesRepository: LocalFilesRepository;
	let fileService: LocalFilesService;

	beforeEach(async () => {
		filesRepository = new LocalFilesRepository();
		fileService = new LocalFilesService(filesRepository);
		await removeAllFilesFromDir(LocalFilesRepository.MEDIAFILES_DIR);
	});

	afterEach(async () => {
		await removeAllFilesFromDir(LocalFilesRepository.MEDIAFILES_DIR);
	});

	it.each(VIDEO_PRESETS)(
		'downloads local media files for preset %s',
		async videoPreset => {
			const downloadedFiles =
				await fileService.downloadBrowserMediaFiles(videoPreset);
			const { videoFile, audioFile } = getExpectedFileNames(videoPreset);

			expect(downloadedFiles).toHaveLength(2);
			expect(path.basename(downloadedFiles[0])).toBe(videoFile);
			expect(path.basename(downloadedFiles[1])).toBe(audioFile);

			expect(filesRepository.fakevideo).toBe(downloadedFiles[0]);
			expect(filesRepository.fakeaudio).toBe(downloadedFiles[1]);

			expect(fs.existsSync(downloadedFiles[0])).toBe(true);
			expect(fs.existsSync(downloadedFiles[1])).toBe(true);
			expect(await filesRepository.existMediaFiles()).toBe(true);

			const expectedVideoPath = path.join(
				LocalFilesRepository.MEDIAFILES_DIR,
				videoFile,
			);
			const expectedAudioPath = path.join(
				LocalFilesRepository.MEDIAFILES_DIR,
				audioFile,
			);

			expect(path.normalize(downloadedFiles[0])).toBe(
				path.normalize(expectedVideoPath),
			);
			expect(path.normalize(downloadedFiles[1])).toBe(
				path.normalize(expectedAudioPath),
			);
		},
	);
});
