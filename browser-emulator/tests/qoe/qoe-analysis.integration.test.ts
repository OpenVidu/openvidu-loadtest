import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QoeAnalysisOrchestratorService } from '../../src/services/qoe-analysis/qoe-analysis-orchestrator.service.ts';
import { LocalFilesRepository } from '../../src/repositories/files/local-files.repository.ts';

const TEST_ASSETS_DIR = path.resolve(
	process.cwd(),
	'tests',
	'integration-native',
	'assets',
);
const VIEWERS_DIR = path.join(TEST_ASSETS_DIR, 'viewers');
const PRESENTER_VIDEO = path.join(
	TEST_ASSETS_DIR,
	'fakevideo_bunny_30fps_640x480.y4m',
);
const PRESENTER_AUDIO = path.join(TEST_ASSETS_DIR, 'fakeaudio_bunny.wav');
const OUTPUT_CUTS_JSON = path.resolve(process.cwd(), 'v-s-u1-u2_cuts.json');

const originalQoeDirDescriptor = Object.getOwnPropertyDescriptor(
	LocalFilesRepository,
	'QOE_RECORDING_DIR',
);

async function removeIfExists(targetPath: string): Promise<void> {
	try {
		await fsPromises.rm(targetPath, { force: true });
	} catch {
		// Ignore missing files.
	}
}

async function waitForCondition(
	predicate: () => Promise<boolean>,
	timeoutMs: number,
	pollMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await predicate()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, pollMs));
	}
	throw new Error('Timed out waiting for QoE analysis completion');
}

describe('QoeAnalysisOrchestratorService integration', () => {
	beforeAll(async () => {
		await removeIfExists(OUTPUT_CUTS_JSON);

		Object.defineProperty(LocalFilesRepository, 'QOE_RECORDING_DIR', {
			value: VIEWERS_DIR,
			configurable: true,
		});

		Object.defineProperty(LocalFilesRepository, 'MEDIAFILES_DIR', {
			value: TEST_ASSETS_DIR,
			configurable: true,
		});

		const localFilesRepository = new LocalFilesRepository();
		await localFilesRepository.downloadMediaFiles(
			path.basename(PRESENTER_VIDEO),
			`https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny_480p_30fps.y4m`,
			path.basename(PRESENTER_AUDIO),
			`https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny.wav`,
		);
	}, 180000);

	afterAll(async () => {
		await removeIfExists(OUTPUT_CUTS_JSON);

		if (originalQoeDirDescriptor) {
			Object.defineProperty(
				LocalFilesRepository,
				'QOE_RECORDING_DIR',
				originalQoeDirDescriptor,
			);
		}
	});

	it('runs QoE analysis and produces the expected cuts file', async () => {
		const localFilesRepositoryMock = {
			fakevideo: PRESENTER_VIDEO,
			fakeaudio: PRESENTER_AUDIO,
		} as LocalFilesRepository;
		const localFilesServiceMock = {
			fakeVideoProperties: {
				fps: 30,
				width: 640,
				height: 480,
			},
		};

		const service = new QoeAnalysisOrchestratorService(
			localFilesServiceMock as never,
			localFilesRepositoryMock,
		);

		const startResult = await service.runQoEAnalysis(
			5,
			1,
			undefined,
			undefined,
			undefined,
			{
				allAnalysis: true,
				onlyFiles: true,
			},
		);
		expect(startResult).toBe('QoE analysis started');

		await waitForCondition(
			() => {
				if (service.getRemainingFiles() !== 0) {
					return Promise.resolve(false);
				}
				return Promise.resolve(fs.existsSync(OUTPUT_CUTS_JSON));
			},
			300000,
			500,
		);

		const fileText = await fsPromises.readFile(OUTPUT_CUTS_JSON, 'utf-8');
		const parsed = JSON.parse(fileText) as unknown;

		expect(Array.isArray(parsed)).toBe(true);
		const parsedArray = parsed as unknown[];
		expect(parsedArray.length).toBe(3);
		console.log(parsedArray);
		for (let i = 0; i < parsedArray.length; i++) {
			const item = parsedArray[i];
			expect(typeof item).toBe('object');
			const cutInfo = item as Record<string, unknown>;
			expect(typeof cutInfo.cut_index).toBe('number');
			expect(cutInfo.cut_index).toBe(i);
			expect(typeof cutInfo.vmaf).toBe('number');
			expect(cutInfo.vmaf).toBeGreaterThanOrEqual(0.85);
			expect(typeof cutInfo.visqol).toBe('number');
			expect(cutInfo.visqol).toBeGreaterThanOrEqual(0.85);
			expect(typeof cutInfo.pesq).toBe('number');
			expect(cutInfo.pesq).toBeGreaterThanOrEqual(0.6);
			expect(typeof cutInfo.psnr).toBe('number');
			expect(cutInfo.psnr).toBeGreaterThanOrEqual(35);
			expect(typeof cutInfo.psnrhvs).toBe('number');
			expect(cutInfo.psnrhvs).toBeGreaterThanOrEqual(35);
			expect(typeof cutInfo.psnrhvsm).toBe('number');
			expect(cutInfo.psnrhvsm).toBeGreaterThanOrEqual(35);
			expect(typeof cutInfo.msssim).toBe('number');
			expect(cutInfo.msssim).toBeGreaterThanOrEqual(0.95);
			expect(typeof cutInfo.ssim).toBe('number');
			expect(cutInfo.ssim).toBeGreaterThanOrEqual(0.95);
			expect(typeof cutInfo.vifp).toBe('number');
			expect(cutInfo.vifp).toBeGreaterThanOrEqual(0.75);
		}
		expect(service.getRemainingFiles()).toBe(0);
	});
});
