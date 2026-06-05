import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
	COLOR_MATCH_TOLERANCE,
	PADDING_COLORS_RGB,
} from './qoe-analysis.constants.ts';
import type {
	CutWindow,
	DetectionState,
	RegularFrameContext,
} from '../../types/qoe-analysis/qoe-analysis.types.ts';
import type { QoeCommandRunner } from './qoe-command-runner.ts';

interface DetectorOcrFrameArtifacts {
	rawDir: string;
	fullDir: string;
}

interface CutDetectionWithOcrArtifacts {
	windows: CutWindow[];
}

export async function detectCutWindowsAndPrepareOcrFrames(
	runner: QoeCommandRunner,
	fixedViewerPath: string,
	width: number,
	height: number,
	fps: number,
	fragmentDurationSecs: number,
	ocrFrames: DetectorOcrFrameArtifacts,
): Promise<CutDetectionWithOcrArtifacts> {
	await Promise.all([
		fsPromises.mkdir(ocrFrames.rawDir, { recursive: true }),
		fsPromises.mkdir(ocrFrames.fullDir, { recursive: true }),
	]);
	const windows = await detectCutWindowsInternal(
		runner,
		fixedViewerPath,
		width,
		height,
		fps,
		fragmentDurationSecs,
		ocrFrames,
	);
	return { windows };
}

async function detectCutWindowsInternal(
	runner: QoeCommandRunner,
	fixedViewerPath: string,
	width: number,
	height: number,
	fps: number,
	fragmentDurationSecs: number,
	ocrFrames: DetectorOcrFrameArtifacts,
): Promise<CutWindow[]> {
	const frameSize = width * height * 3;
	let frameIndex = 0;
	let remainder = Buffer.alloc(0);

	const detectionState: DetectionState = {
		isBeginPadding: false,
		isBeginningVideo: true,
		currentCutFrames: 0,
		currentStartSeconds: null,
		cutIndex: 0,
		previousEndSeconds: null,
	};
	const windows: CutWindow[] = [];
	const ffmpegCommand = buildDetectionCommand(
		runner,
		fixedViewerPath,
		width,
		height,
		ocrFrames,
	);

	const consumeFrame = (frame: Buffer) => {
		const isPadding = isPaddingFrame(frame, width, height);

		if (detectionState.isBeginPadding) {
			if (!isPadding) {
				const state = beginCutAfterPadding(
					frameIndex,
					fps,
					fragmentDurationSecs,
					detectionState.previousEndSeconds,
				);
				detectionState.isBeginPadding = false;
				detectionState.currentStartSeconds = state.currentStartSeconds;
				detectionState.currentCutFrames = state.currentCutFrames;
			}
			frameIndex += 1;
			return;
		}

		const state = handleRegularFrameState(detectionState, {
			isPadding,
			frameIndex,
			fps,
			fragmentDurationSecs,
			windows,
		});
		detectionState.isBeginPadding = state.isBeginPadding;
		detectionState.isBeginningVideo = state.isBeginningVideo;
		detectionState.currentCutFrames = state.currentCutFrames;
		detectionState.currentStartSeconds = state.currentStartSeconds;
		detectionState.cutIndex = state.cutIndex;
		detectionState.previousEndSeconds = state.previousEndSeconds;

		frameIndex += 1;
	};

	await runner.streamRawFrames(ffmpegCommand, chunk => {
		remainder = Buffer.concat([remainder, chunk]);
		while (remainder.length >= frameSize) {
			const frame = remainder.subarray(0, frameSize);
			remainder = remainder.subarray(frameSize);
			consumeFrame(frame);
		}
	});

	return windows;
}

function buildDetectionCommand(
	runner: QoeCommandRunner,
	fixedViewerPath: string,
	width: number,
	height: number,
	ocrFrames: DetectorOcrFrameArtifacts,
): string {
	const left = Math.floor(width / 2.5);
	const right = Math.floor(width / 1.7);
	const top = Math.floor(height / 1.12);
	const bottom = Math.floor(height / 1.02);
	const cropWidth = Math.max(1, right - left);
	const cropHeight = Math.max(1, bottom - top);
	const rawPattern = path.join(ocrFrames.rawDir, '%06d.png');
	const fullPattern = path.join(ocrFrames.fullDir, '%06d.png');

	const filterComplex =
		`[0:v]split=3[fullraw][fullpngsrc][ocrrawsrc];` +
		`[fullraw]format=rgb24[fullrgb];` +
		`[fullpngsrc]format=rgb24[fullpng];` +
		`[ocrrawsrc]crop=${cropWidth}:${cropHeight}:${left}:${top},` +
		`scale=-1:150:flags=bicubic,` +
		`format=gray,` +
		`eq=contrast=1.2:brightness=0.02,` +
		`lut=y='if(gt(val,140),255,0)',` +
		`pad=iw+60:ih+60:30:30:color=white` +
		`[ocrraw];`;

	return `ffmpeg -v error -threads 1 -i ${runner.quote(fixedViewerPath)} -filter_complex "${filterComplex}" -map "[fullrgb]" -f rawvideo -pix_fmt rgb24 pipe:1 -map "[fullpng]" -fps_mode passthrough ${runner.quote(fullPattern)} -map "[ocrraw]" -fps_mode passthrough ${runner.quote(rawPattern)}`;
}

function isPaddingFrame(frame: Buffer, width: number, height: number): boolean {
	const matchHeight = Math.floor(height / 3);
	const bar = Math.floor(width / 8);
	const halfBar = Math.floor(bar / 2);

	for (let idx = 0; idx < PADDING_COLORS_RGB.length; idx++) {
		const sampleX = Math.floor(halfBar + bar * (idx + 1)) - 1;
		const sampleY = matchHeight - 1;
		const x = Math.min(Math.max(sampleX, 0), width - 1);
		const y = Math.min(Math.max(sampleY, 0), height - 1);
		const offset = (y * width + x) * 3;

		const red = frame[offset];
		const green = frame[offset + 1];
		const blue = frame[offset + 2];
		const expected = PADDING_COLORS_RGB[idx];
		if (
			Math.abs(red - expected[0]) > COLOR_MATCH_TOLERANCE ||
			Math.abs(green - expected[1]) > COLOR_MATCH_TOLERANCE ||
			Math.abs(blue - expected[2]) > COLOR_MATCH_TOLERANCE
		) {
			return false;
		}
	}

	return true;
}

function beginCutAfterPadding(
	frameIndex: number,
	fps: number,
	fragmentDurationSecs: number,
	previousEndSeconds: number | null,
): { currentStartSeconds: number; currentCutFrames: number } {
	let currentStartSeconds = frameIndex / fps;
	if (
		previousEndSeconds !== null &&
		currentStartSeconds < previousEndSeconds
	) {
		currentStartSeconds = previousEndSeconds + fragmentDurationSecs;
	}
	return {
		currentStartSeconds,
		currentCutFrames: 1,
	};
}

function handleRegularFrameState(
	state: DetectionState,
	context: RegularFrameContext,
): DetectionState {
	const { isPadding, frameIndex, fps, fragmentDurationSecs, windows } =
		context;
	const {
		isBeginningVideo,
		currentCutFrames,
		currentStartSeconds,
		cutIndex,
		previousEndSeconds,
	} = state;

	if (!isPadding) {
		return {
			isBeginPadding: false,
			isBeginningVideo,
			currentCutFrames: isBeginningVideo
				? currentCutFrames
				: currentCutFrames + 1,
			currentStartSeconds,
			cutIndex,
			previousEndSeconds,
		};
	}

	if (currentCutFrames <= 0 || currentStartSeconds === null) {
		return {
			isBeginPadding: true,
			isBeginningVideo: false,
			currentCutFrames: 0,
			currentStartSeconds: null,
			cutIndex,
			previousEndSeconds: null,
		};
	}

	if (currentCutFrames > fragmentDurationSecs * fps) {
		return {
			isBeginPadding: true,
			isBeginningVideo: false,
			currentCutFrames: 0,
			currentStartSeconds: null,
			cutIndex,
			previousEndSeconds: null,
		};
	}

	let endSeconds = frameIndex / fps;
	if (endSeconds <= currentStartSeconds) {
		endSeconds = currentStartSeconds + fragmentDurationSecs;
	}
	windows.push({
		cutIndex,
		startSeconds: currentStartSeconds,
		endSeconds,
	});

	return {
		isBeginPadding: true,
		isBeginningVideo: false,
		currentCutFrames: 0,
		currentStartSeconds: null,
		cutIndex: cutIndex + 1,
		previousEndSeconds: endSeconds,
	};
}
