import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type {
	AnalyzeQoEInput,
	CutWindow,
} from '../../types/qoe-analysis/qoe-analysis.types.ts';
import type { QoeCommandRunner } from './qoe-command-runner.ts';

interface AlignerOcrFrameArtifacts {
	rawDir: string;
	fullDir: string;
}

interface OcrConfig {
	psm: number;
}

const OCR_CONFIGS: readonly OcrConfig[] = [{ psm: 6 }, { psm: 7 }, { psm: 8 }];

const OCR_MIN_CONFIDENCE = 43;

export async function buildAlignedViewerYuv(
	runner: QoeCommandRunner,
	window: CutWindow,
	input: AnalyzeQoEInput,
	viewerYuvPath: string,
	tmpDir: string,
	ocrFrames: AlignerOcrFrameArtifacts,
): Promise<boolean> {
	const cutDir = path.join(tmpDir, `${input.prefix}_${window.cutIndex}_ocr`);
	const rawDir = ocrFrames.rawDir;
	const fullDir = ocrFrames.fullDir;
	const alignedDir = path.join(cutDir, 'aligned');

	await fsPromises.mkdir(alignedDir, { recursive: true });

	const frameFiles = await getCutFrameFilesFromSharedOcrArtifacts(
		rawDir,
		fullDir,
		{
			fps: input.fps,
			fragmentDurationSecs: input.fragmentDurationSecs,
			startSeconds: window.startSeconds,
		},
	);

	if (frameFiles.length === 0) {
		return false;
	}

	let frameNumbers: number[];
	try {
		frameNumbers = await collectFrameNumbers(
			runner,
			frameFiles,
			rawDir,
			input.fragmentDurationSecs,
			input.fps,
		);
	} catch {
		return false;
	}

	const alignedPaths = buildAlignedFramePaths(
		frameFiles,
		frameNumbers,
		fullDir,
		input.fragmentDurationSecs * input.fps,
	);

	if (alignedPaths.length === 0) {
		return false;
	}

	await materializeAlignedSequence(alignedPaths, alignedDir);

	await runner.runAndCapture(
		`ffmpeg -y -threads 1 -framerate ${input.fps} -i ${runner.quote(path.join(alignedDir, '%06d.png'))} -an -pix_fmt yuv420p ${runner.quote(viewerYuvPath)}`,
	);

	return true;
}

async function getCutFrameFilesFromSharedOcrArtifacts(
	rawDir: string,
	fullDir: string,
	windowInfo: {
		fps: number;
		fragmentDurationSecs: number;
		startSeconds: number;
	},
): Promise<string[]> {
	const [rawFiles, fullFiles] = await Promise.all([
		fsPromises.readdir(rawDir),
		fsPromises.readdir(fullDir),
	]);
	const rawSet = new Set(
		rawFiles.filter(file => file.toLowerCase().endsWith('.png')),
	);
	const fullSet = new Set(
		fullFiles.filter(file => file.toLowerCase().endsWith('.png')),
	);

	const startFrameIndex = Math.max(
		1,
		Math.floor(windowInfo.startSeconds * windowInfo.fps) + 1,
	);
	const targetFrameCount = Math.max(
		1,
		Math.round(windowInfo.fragmentDurationSecs * windowInfo.fps),
	);

	const selected: string[] = [];
	for (
		let index = startFrameIndex;
		index < startFrameIndex + targetFrameCount;
		index += 1
	) {
		const fileName = `${String(index).padStart(6, '0')}.png`;
		if (rawSet.has(fileName) && fullSet.has(fileName)) {
			selected.push(fileName);
		}
	}

	return selected;
}

async function collectFrameNumbers(
	runner: QoeCommandRunner,
	frameFiles: string[],
	rawDir: string,
	fragmentDurationSecs: number,
	fps: number,
): Promise<number[]> {
	const maxFrameNumber = fragmentDurationSecs * fps;
	const framePaths = frameFiles.map(file => path.join(rawDir, file));

	const results = await Promise.all(
		framePaths.map(framePath =>
			detectFrameNumber(runner, framePath, maxFrameNumber),
		),
	);

	return results.flat();
}

async function detectFrameNumber(
	runner: QoeCommandRunner,
	framePath: string,
	maxFrameNumber: number,
): Promise<number> {
	for (const config of OCR_CONFIGS) {
		const output = await runner.runAndCapture(
			`tesseract ${runner.quote(framePath)} stdout --oem 1 --psm ${config.psm} -c tessedit_char_whitelist=0123456789 -c classify_bln_numeric_mode=1 -c textord_min_blobs_for_diagonal_text=4 -c textord_min_xheight=12 -c textord_min_linesize=40 tsv`,
		);
		const maybeNumber = parseBestOcrNumber(output, maxFrameNumber);
		if (maybeNumber !== null) {
			return maybeNumber;
		}
	}
	return -1;
}

function parseBestOcrNumber(
	output: string,
	maxFrameNumber: number,
): number | null {
	const lines = output
		.split(/\r?\n/u)
		.map(line => line.trim())
		.filter(line => line.length > 0);

	let bestConfidence = -1;
	let bestText = '';

	for (let index = 1; index < lines.length; index += 1) {
		const columns = lines[index].split('\t');
		if (columns.length < 12) {
			continue;
		}
		const confidence = Number.parseFloat(columns[10]);
		const text = columns.slice(11).join('');
		if (!Number.isFinite(confidence) || confidence < OCR_MIN_CONFIDENCE) {
			continue;
		}
		if (!/^\d+$/u.test(text)) {
			continue;
		}
		if (confidence > bestConfidence) {
			bestConfidence = confidence;
			bestText = text;
		}
	}

	if (bestText.length === 0) {
		return null;
	}

	const value = Number.parseInt(bestText, 10);
	if (!Number.isFinite(value) || value <= 0 || value > maxFrameNumber) {
		return null;
	}

	return value;
}

function buildAlignedFramePaths(
	frameFiles: string[],
	frameNumbers: number[],
	rawDir: string,
	targetFrameCount: number,
): string[] {
	const sourcePaths = frameFiles.map(file => path.join(rawDir, file));
	const aligned = new Array<string | undefined>(targetFrameCount).fill(
		undefined,
	);

	let counterFrames = targetFrameCount;
	for (let index = sourcePaths.length - 1; index >= 0; index -= 1) {
		const number = frameNumbers[index];
		if (!Number.isInteger(number) || number <= 0) {
			continue;
		}
		for (let j = number; j <= counterFrames; j += 1) {
			aligned[j - 1] = sourcePaths[index];
		}
		counterFrames = number - 1;
	}

	const firstNumberIndex = frameNumbers.findIndex(
		value => Number.isInteger(value) && value > 0,
	);
	if (firstNumberIndex === -1) {
		return [];
	}

	const firstNumber = frameNumbers[firstNumberIndex];
	const firstFramePath = sourcePaths[firstNumberIndex];
	if (firstNumber > 1) {
		for (let j = 1; j < firstNumber; j += 1) {
			aligned[j - 1] = firstFramePath;
		}
	}

	let lastKnown: string | undefined = firstFramePath;
	for (let index = 0; index < aligned.length; index += 1) {
		if (aligned[index] !== undefined) {
			lastKnown = aligned[index];
			continue;
		}
		aligned[index] = lastKnown;
	}

	return aligned.filter(
		(value): value is string => typeof value === 'string',
	);
}

async function materializeAlignedSequence(
	alignedPaths: string[],
	alignedDir: string,
): Promise<void> {
	await Promise.all(
		alignedPaths.map((sourcePath, index) => {
			const destination = path.join(
				alignedDir,
				`${String(index + 1).padStart(6, '0')}.png`,
			);
			return fsPromises.copyFile(sourcePath, destination);
		}),
	);
}
