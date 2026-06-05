import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_CWD } from '../../setup/unit/global-fs-setup.ts';
import { buildAlignedViewerYuv } from '../../../src/services/qoe-analysis/qoe-ocr-aligner.ts';

interface RunnerMockState {
	calls: string[];
	createExtractedFrames: boolean;
	ocrByFrameName: Record<string, string[]>;
}

function createRunner(state: RunnerMockState) {
	const runAndCapture = vi.fn(async (command: string) => {
		state.calls.push(command);

		if (
			command.includes('-framerate') &&
			command.includes('-pix_fmt yuv420p')
		) {
			const yuvPathMatch = /"([^"]+\.yuv)"\s*$/u.exec(command);
			if (yuvPathMatch) {
				await fsPromises.writeFile(yuvPathMatch[1], 'aligned-yuv');
			}
			return '';
		}

		if (command.includes('%06d.png')) {
			if (!state.createExtractedFrames) {
				return '';
			}
			const outputPatternMatch = /"([^"]*%06d\.png)"/u.exec(command);
			if (!outputPatternMatch) {
				return '';
			}
			const outputPattern = outputPatternMatch[1];
			const targetDir = path.dirname(outputPattern);
			await fsPromises.mkdir(targetDir, { recursive: true });
			await Promise.all([
				fsPromises.writeFile(
					path.join(targetDir, '000001.png'),
					'frame-1',
				),
				fsPromises.writeFile(
					path.join(targetDir, '000002.png'),
					'frame-2',
				),
				fsPromises.writeFile(
					path.join(targetDir, '000003.png'),
					'frame-3',
				),
			]);
			return '';
		}

		if (command.startsWith('tesseract ')) {
			const framePathMatch = /tesseract\s+"([^"]+)"\s+stdout/u.exec(
				command,
			);
			if (!framePathMatch) {
				return buildTsv('99', '1');
			}
			const frameName = path.basename(framePathMatch[1]);
			const responses = state.ocrByFrameName[frameName] ?? [
				buildTsv('0', 'x'),
			];
			const response = responses.shift() ?? buildTsv('0', 'x');
			state.ocrByFrameName[frameName] = responses;
			return response;
		}

		return '';
	});

	return {
		runAndCapture,
		quote: (value: string) => `"${value}"`,
	};
}

function buildTsv(confidence: string, text: string): string {
	return [
		'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
		`5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t${confidence}\t${text}`,
	].join('\n');
}

async function createOCRFrameImages(tmpDir: string) {
	const createFilePromises = [];
	for (let i = 1; i <= 210; i++) {
		let ocrFrameContent = 'padding';
		let fullFrameContent = 'full-padding';
		if (i > 30 && i <= 180) {
			ocrFrameContent = `ocr-frame-${i - 30}`;
			fullFrameContent = `full-frame-${i - 30}`;
		}
		createFilePromises.push(
			fsPromises.writeFile(
				`${tmpDir}/ocr_raw/${i.toString().padStart(6, '0')}.png`,
				ocrFrameContent,
			),
			fsPromises.writeFile(
				`${tmpDir}/ocr_full/${i.toString().padStart(6, '0')}.png`,
				fullFrameContent,
			),
		);
	}
	return Promise.all(createFilePromises);
}

describe('qoe-ocr-aligner', () => {
	const tmpDir = `${MOCK_CWD}/tmp`;
	const viewerYuvPath = `${tmpDir}/viewer_aligned.yuv`;

	beforeEach(async () => {
		await fsPromises.mkdir(`${tmpDir}/ocr_raw`, { recursive: true });
		await fsPromises.mkdir(`${tmpDir}/ocr_full`, { recursive: true });
	});

	it('returns false when no cropped frames are extracted', async () => {
		const state: RunnerMockState = {
			calls: [],
			createExtractedFrames: false,
			ocrByFrameName: {},
		};
		const runner = createRunner(state);

		const built = await buildAlignedViewerYuv(
			runner as never,
			{ cutIndex: 0, startSeconds: 1, endSeconds: 2 },
			{
				viewerPath: `${tmpDir}/viewer.webm`,
				presenterPath: `${tmpDir}/presenter.y4m`,
				presenterAudioPath: `${tmpDir}/presenter.wav`,
				prefix: 'pref',
				fragmentDurationSecs: 5,
				paddingDurationSecs: 1,
				width: 640,
				height: 480,
				fps: 30,
			},
			viewerYuvPath,
			tmpDir,
			{
				rawDir: `${tmpDir}/ocr_raw`,
				fullDir: `${tmpDir}/ocr_full`,
			},
		);

		expect(built).toBe(false);
		expect(fs.existsSync(viewerYuvPath)).toBe(false);
	});

	it('builds aligned yuv and backfills missing frame counters', async () => {
		await createOCRFrameImages(tmpDir);
		const ocrByFrameName: Record<string, string[]> = {};
		for (let i = 31; i <= 181; i++) {
			const frameNumber = i - 30;
			ocrByFrameName[`${i.toString().padStart(6, '0')}.png`] = [
				buildTsv('95', frameNumber.toString()),
			];
		}
		ocrByFrameName['000037.png'] = [buildTsv('10', '7')];
		await fsPromises.unlink(`${tmpDir}/ocr_raw/000122.png`);
		delete ocrByFrameName['000122.png'];
		const state: RunnerMockState = {
			calls: [],
			createExtractedFrames: true,
			ocrByFrameName,
		};
		const runner = createRunner(state);

		const built = await buildAlignedViewerYuv(
			runner as never,
			{ cutIndex: 0, startSeconds: 1, endSeconds: 6 },
			{
				viewerPath: `${tmpDir}/viewer.webm`,
				presenterPath: `${tmpDir}/presenter.y4m`,
				presenterAudioPath: `${tmpDir}/presenter.wav`,
				prefix: 'pref',
				fragmentDurationSecs: 5,
				paddingDurationSecs: 1,
				width: 640,
				height: 480,
				fps: 30,
			},
			viewerYuvPath,
			tmpDir,
			{
				rawDir: `${tmpDir}/ocr_raw`,
				fullDir: `${tmpDir}/ocr_full`,
			},
		);

		expect(built).toBe(true);
		expect(fs.existsSync(viewerYuvPath)).toBe(true);

		const alignedDir = path.join(tmpDir, 'pref_0_ocr', 'aligned');
		const alignedFiles = (await fsPromises.readdir(alignedDir)).sort();
		for (let i = 1; i <= 150; i++) {
			expect(alignedFiles[i - 1]).toEqual(
				`${i.toString().padStart(6, '0')}.png`,
			);
			const content = await fsPromises.readFile(
				path.join(alignedDir, `${i.toString().padStart(6, '0')}.png`),
				'utf-8',
			);
			if (i === 7) {
				// The OCR misread frame 37 as 7, so the aligned sequence should backfill it as frame-7
				expect(content).toBe('full-frame-6');
			} else if (i === 92) {
				// Frame 122 is missing, so the aligned sequence should backfill it as frame-(121 - 30)
				expect(content).toBe('full-frame-91');
			} else {
				expect(content).toBe(`full-frame-${i}`);
			}
		}
	});

	it('returns false when OCR cannot detect any valid frame numbers', async () => {
		const state: RunnerMockState = {
			calls: [],
			createExtractedFrames: true,
			ocrByFrameName: {
				'000001.png': [
					buildTsv('10', 'x'),
					buildTsv('10', 'x'),
					buildTsv('10', 'x'),
					buildTsv('10', 'x'),
				],
				'000002.png': [
					buildTsv('10', 'x'),
					buildTsv('10', 'x'),
					buildTsv('10', 'x'),
					buildTsv('10', 'x'),
				],
				'000003.png': [
					buildTsv('10', 'x'),
					buildTsv('10', 'x'),
					buildTsv('10', 'x'),
					buildTsv('10', 'x'),
				],
			},
		};
		const runner = createRunner(state);

		const built = await buildAlignedViewerYuv(
			runner as never,
			{ cutIndex: 0, startSeconds: 1, endSeconds: 2 },
			{
				viewerPath: `${tmpDir}/viewer.webm`,
				presenterPath: `${tmpDir}/presenter.y4m`,
				presenterAudioPath: `${tmpDir}/presenter.wav`,
				prefix: 'pref',
				fragmentDurationSecs: 3,
				paddingDurationSecs: 1,
				width: 640,
				height: 480,
				fps: 1,
			},
			viewerYuvPath,
			tmpDir,
			{
				rawDir: `${tmpDir}/ocr_raw`,
				fullDir: `${tmpDir}/ocr_full`,
			},
		);

		expect(built).toBe(false);
		expect(
			state.calls.some(command => command.includes('-framerate')),
		).toBe(false);
	});
});
