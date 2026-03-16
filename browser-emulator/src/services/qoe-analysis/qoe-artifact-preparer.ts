import path from 'node:path';
import { PESQ_SAMPLE_RATE } from './qoe-analysis.constants.ts';
import type {
	AnalyzeQoEInput,
	PresenterArtifacts,
} from '../../types/qoe-analysis/qoe-analysis.types.ts';
import type { QoeCommandRunner } from './qoe-command-runner.ts';

export async function preparePresenterArtifacts(
	runner: QoeCommandRunner,
	tmpDir: string,
	input: AnalyzeQoEInput,
): Promise<PresenterArtifacts> {
	const presenterYuv = path.join(tmpDir, 'presenter.yuv');
	const presenterWav = path.join(tmpDir, 'presenter.wav');
	const presenterPesqWav = path.join(tmpDir, 'presenter-pesq.wav');
	const start = input.paddingDurationSecs;
	const end = input.paddingDurationSecs + input.fragmentDurationSecs;

	await Promise.all([
		runner.runAndCapture(
			`ffmpeg -n -threads 1 -i ${runner.quote(input.presenterPath)} -an -ss ${start} -to ${end} ${runner.quote(presenterYuv)}`,
		),
		runner.runAndCapture(
			`ffmpeg -n -threads 1 -i ${runner.quote(input.presenterAudioPath)} -ss ${start} -to ${end} -async 1 ${runner.quote(presenterWav)}`,
		),
		runner.runAndCapture(
			`ffmpeg -n -threads 1 -i ${runner.quote(input.presenterAudioPath)} -ss ${start} -to ${end} -async 1 -ar ${PESQ_SAMPLE_RATE} ${runner.quote(presenterPesqWav)}`,
		),
	]);

	return { presenterYuv, presenterWav, presenterPesqWav };
}

export async function fixVideoResolution(
	runner: QoeCommandRunner,
	inputVideoPath: string,
	outputVideoPath: string,
	width: number,
	height: number,
): Promise<void> {
	await runner.runAndCapture(
		`ffmpeg -y -i ${runner.quote(inputVideoPath)} -vf scale=${width}:${height} -c:a copy ${runner.quote(outputVideoPath)}`,
	);
}
