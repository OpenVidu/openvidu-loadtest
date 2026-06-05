import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	fixVideoResolution,
	preparePresenterArtifacts,
} from './qoe-artifact-preparer.ts';
import type {
	AnalyzeQoEInput,
	OcrFrameArtifacts,
	QoECutJson,
} from '../../types/qoe-analysis/qoe-analysis.types.ts';
import { detectCutWindowsAndPrepareOcrFrames } from './qoe-cut-window-detector.ts';
import { validateQoeDependencies } from './qoe-dependency-validator.ts';
import { runCutAnalysis } from './qoe-metrics.ts';
import type { QoeCommandRunner } from './qoe-command-runner.ts';

export class QoeAnalyzerService {
	private readonly runner: QoeCommandRunner;

	constructor(qoeCommandRunner: QoeCommandRunner) {
		this.runner = qoeCommandRunner;
	}

	public async analyzeFile(input: AnalyzeQoEInput): Promise<void> {
		await validateQoeDependencies(
			this.runner,
			input.qoeConfig?.allAnalysis ?? false,
		);
		const tmpDir = await fsPromises.mkdtemp(
			path.join(os.tmpdir(), `qoe-${input.prefix}-`),
		);

		try {
			const fixedViewerPath = path.join(tmpDir, 'viewer_fixed.webm');
			const ocrFrames: OcrFrameArtifacts = {
				rawDir: path.join(tmpDir, `${input.prefix}_ocr_all`, 'raw'),
				fullDir: path.join(tmpDir, `${input.prefix}_ocr_all`, 'full'),
			};
			const [presenter] = await Promise.all([
				preparePresenterArtifacts(this.runner, tmpDir, input),
				fixVideoResolution(
					this.runner,
					input.viewerPath,
					fixedViewerPath,
					input.width,
					input.height,
				),
			]);

			const { windows: cutWindows } =
				await detectCutWindowsAndPrepareOcrFrames(
					this.runner,
					fixedViewerPath,
					input.width,
					input.height,
					input.fps,
					input.fragmentDurationSecs,
					ocrFrames,
				);
			const results: QoECutJson[] = await Promise.all(
				cutWindows.map(window =>
					runCutAnalysis(
						this.runner,
						window,
						input,
						presenter,
						tmpDir,
						ocrFrames,
						input.fps * input.fragmentDurationSecs,
					),
				),
			);

			await fsPromises.writeFile(
				`${input.prefix}_cuts.json`,
				JSON.stringify(results),
				'utf-8',
			);
		} finally {
			if (!input.qoeConfig?.debug) {
				await fsPromises.rm(tmpDir, { recursive: true, force: true });
			}
		}
	}
}
