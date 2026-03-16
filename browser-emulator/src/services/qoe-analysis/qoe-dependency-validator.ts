import type { QoeCommandRunner } from './qoe-command-runner.ts';

export async function validateQoeDependencies(
	runner: QoeCommandRunner,
	allAnalysis: boolean,
): Promise<void> {
	await Promise.all([
		runner.runAndCapture('which vmaf'),
		runner.runAndCapture('which visqol'),
		runner.runAndCapture('which ffmpeg'),
		runner.runAndCapture('which tesseract'),
		...(allAnalysis
			? [
					runner.runAndCapture('which vqmt'),
					runner.runAndCapture('which pesq'),
				]
			: []),
	]);
}
