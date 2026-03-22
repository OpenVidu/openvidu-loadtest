import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MOCK_CWD } from '../../setup/unit/global-fs-setup.ts';
import { PADDING_COLORS_RGB } from '../../../src/services/qoe-analysis/qoe-analysis.constants.ts';
import { detectCutWindowsAndPrepareOcrFrames } from '../../../src/services/qoe-analysis/qoe-cut-window-detector.ts';

function buildPaddingFrame(width: number, height: number): Buffer {
	const frame = Buffer.alloc(width * height * 3, 0);
	const matchHeight = Math.floor(height / 3);
	const bar = Math.floor(width / 8);
	const halfBar = Math.floor(bar / 2);
	for (let idx = 0; idx < PADDING_COLORS_RGB.length; idx++) {
		const sampleX = Math.floor(halfBar + bar * (idx + 1)) - 1;
		const sampleY = matchHeight - 1;
		const offset = (sampleY * width + sampleX) * 3;
		frame[offset] = PADDING_COLORS_RGB[idx][0];
		frame[offset + 1] = PADDING_COLORS_RGB[idx][1];
		frame[offset + 2] = PADDING_COLORS_RGB[idx][2];
	}
	return frame;
}

function buildPatternBuffer(sequence: [Buffer, number][]): Buffer {
	// 1) Compute total length
	let totalLength = 0;
	for (const [buf, count] of sequence) {
		totalLength += buf.length * count;
	}

	// 2) Allocate a single output buffer
	const out = Buffer.allocUnsafe(totalLength);

	// 3) Copy chunks in the correct order
	let offset = 0;
	for (const [buf, count] of sequence) {
		for (let i = 0; i < count; i++) {
			buf.copy(out, offset);
			offset += buf.length;
		}
	}

	return out;
}

const width = 640;
const height = 480;
const frameSize = width * height * 3;
const padding = buildPaddingFrame(width, height);
const nonPadding = Buffer.alloc(frameSize, 0);
describe('qoe-cut-window-detector', () => {
	it.each([
		[
			[
				[nonPadding, 24],
				[padding, 30],
				[nonPadding, 150],
				[padding, 30],
				[nonPadding, 150],
				[padding, 13],
			] as [Buffer, number][],
			[
				{ cutIndex: 0, startSeconds: 1.8, endSeconds: 6.8 },
				{ cutIndex: 1, startSeconds: 7.8, endSeconds: 12.8 },
			],
		],
		[
			[
				[padding, 30],
				[nonPadding, 150],
				[padding, 30],
				[nonPadding, 150],
			] as [Buffer, number][],
			// Only 1 window as the ending padding is needed to cut
			[{ cutIndex: 0, startSeconds: 1, endSeconds: 6 }],
		],
	])(
		'detects windows from padding/non-padding transitions and handles chunk boundaries (case %#)',
		{ timeout: 10000 },
		async (sequence: [Buffer, number][], expectedWindows) => {
			const frames = buildPatternBuffer(sequence);
			const tempRoot = `${MOCK_CWD}/tmp`;
			await fsPromises.mkdir(tempRoot, { recursive: true });
			const tmpDir = await fsPromises.mkdtemp(
				path.join(tempRoot, 'qoe-detector-test-'),
			);

			const runner = {
				quote: vi.fn((value: string) => `"${value}"`),
				streamRawFrames: vi.fn(
					(_command: string, onChunk: (chunk: Buffer) => void) => {
						onChunk(frames.subarray(0, frameSize + 7));
						onChunk(frames.subarray(frameSize + 7));
						return Promise.resolve();
					},
				),
			};

			try {
				const result = await detectCutWindowsAndPrepareOcrFrames(
					runner as never,
					'/tmp/viewer_fixed.webm',
					width,
					height,
					30,
					5,
					{
						rawDir: path.join(tmpDir, 'raw'),
						fullDir: path.join(tmpDir, 'full'),
					},
				);

				expect(runner.streamRawFrames).toHaveBeenCalledTimes(1);
				expect(result.windows).toEqual(expectedWindows);
			} finally {
				await fsPromises.rm(tmpDir, { recursive: true, force: true });
			}
		},
	);
});
