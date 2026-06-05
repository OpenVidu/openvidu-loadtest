import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { buildAlignedViewerYuv } from './qoe-ocr-aligner.ts';
import { PESQ_SAMPLE_RATE } from './qoe-analysis.constants.ts';
import type {
	AnalyzeQoEInput,
	CutWindow,
	OcrFrameArtifacts,
	PresenterArtifacts,
	QoECutJson,
} from '../../types/qoe-analysis/qoe-analysis.types.ts';
import type { QoeCommandRunner } from './qoe-command-runner.ts';

interface MetricFileContext {
	tmpDir: string;
	prefix: string;
	cutIndex: number;
	width: number;
	height: number;
}

export async function runCutAnalysis(
	runner: QoeCommandRunner,
	window: CutWindow,
	input: AnalyzeQoEInput,
	presenter: PresenterArtifacts,
	tmpDir: string,
	ocrFrames: OcrFrameArtifacts,
	numberOfFrames: number,
): Promise<QoECutJson> {
	const viewerYuv = path.join(
		tmpDir,
		`${input.prefix}_${window.cutIndex}.yuv`,
	);
	const viewerWav = path.join(
		tmpDir,
		`${input.prefix}_${window.cutIndex}.wav`,
	);
	const viewerPesqWav = path.join(
		tmpDir,
		`${input.prefix}_pesq_${window.cutIndex}.wav`,
	);
	const metricContext: MetricFileContext = {
		tmpDir,
		prefix: input.prefix,
		cutIndex: window.cutIndex,
		width: input.width,
		height: input.height,
	};

	const result: QoECutJson = {
		cut_index: window.cutIndex,
		vmaf: 0,
		visqol: 0,
	};
	const promises = [];
	const videoProcessingProcess = (async () => {
		// start alignment immediately and build dependent metric promises off it
		const alignedViewerPromise = buildAlignedViewerYuv(
			runner,
			window,
			input,
			viewerYuv,
			tmpDir,
			ocrFrames,
		);

		const vmafPromise = alignedViewerPromise.then(aligned => {
			if (!aligned) {
				throw new Error(
					`OCR alignment failed for cut ${window.cutIndex}; cannot continue QoE analysis without aligned viewer frames`,
				);
			}
			return runVmaf(
				runner,
				presenter.presenterYuv,
				viewerYuv,
				metricContext,
			);
		});

		if (input.qoeConfig?.allAnalysis) {
			// vqmt can run in parallel with vmaf once alignment completes
			const vqmtPromise = alignedViewerPromise.then(aligned => {
				if (!aligned) {
					throw new Error(
						`OCR alignment failed for cut ${window.cutIndex}; cannot continue QoE analysis without aligned viewer frames`,
					);
				}
				return runVqmt(
					runner,
					presenter.presenterYuv,
					viewerYuv,
					numberOfFrames,
					metricContext,
				);
			});

			const [vmafValue, vqmtResults] = await Promise.all([
				vmafPromise,
				vqmtPromise,
			]);
			result.vmaf = normalize(vmafValue, 0, 100);
			result.msssim = vqmtResults.msssim;
			result.psnr = vqmtResults.psnr;
			result.psnrhvs = vqmtResults.psnrhvs;
			result.ssim = vqmtResults.ssim;
			result.vifp = vqmtResults.vifp;
			result.psnrhvsm = vqmtResults.psnrhvsm;
		} else {
			const vmafValue = await vmafPromise;
			result.vmaf = normalize(vmafValue, 0, 100);
		}
	})();
	const audioProcessingProcess = runner
		.runAndCapture(
			`ffmpeg -y -threads 1 -i ${runner.quote(input.viewerPath)} -ss ${window.startSeconds} -to ${window.endSeconds} -async 1 ${runner.quote(viewerWav)}`,
		)
		.then(() => runVisqol(runner, presenter.presenterWav, viewerWav))
		.then((visqol: number) => (result.visqol = normalize(visqol, 1, 5)));
	promises.push(videoProcessingProcess, audioProcessingProcess);
	if (input.qoeConfig?.allAnalysis) {
		const pesqProcessingProcess = runner
			.runAndCapture(
				`ffmpeg -y -threads 1 -i ${runner.quote(input.viewerPath)} -ss ${window.startSeconds} -to ${window.endSeconds} -async 1 -ar ${PESQ_SAMPLE_RATE} ${runner.quote(viewerPesqWav)}`,
			)
			.then(() =>
				runPesq(
					runner,
					presenter.presenterPesqWav,
					viewerPesqWav,
					metricContext,
				),
			)
			.then((pesq: number) => (result.pesq = normalize(pesq, 1, 5)));
		promises.push(pesqProcessingProcess);
	}
	await Promise.all(promises);
	return result;
}

async function runVmaf(
	runner: QoeCommandRunner,
	presenterYuv: string,
	viewerYuv: string,
	context: MetricFileContext,
): Promise<number> {
	const outFile = path.join(
		context.tmpDir,
		`${context.prefix}-${context.cutIndex}_vmaf.json`,
	);
	await runner.runAndCapture(
		`vmaf --threads 1 -p 420 -w ${context.width} -h ${context.height} -b 8 -r ${runner.quote(presenterYuv)} -d ${runner.quote(viewerYuv)} -m path=/usr/local/share/vmaf/models/vmaf_v0.6.1.json --json -o ${runner.quote(outFile)}`,
	);
	const output = await fsPromises.readFile(outFile, 'utf-8');
	const parsed: unknown = JSON.parse(output);
	return parseVmafJson(parsed);
}

function parseVmafJson(value: unknown): number {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Invalid VMAF JSON payload');
	}
	const root = value as Record<string, unknown>;
	const framesAverage = tryGetVmafFramesAverage(root.frames);
	if (framesAverage !== null) {
		return framesAverage;
	}
	return getVmafPooledMean(root.pooled_metrics);
}

async function runVisqol(
	runner: QoeCommandRunner,
	presenterWav: string,
	viewerWav: string,
): Promise<number> {
	const output = await runner.runAndCapture(
		`visqol --reference_file ${runner.quote(presenterWav)} --degraded_file ${runner.quote(viewerWav)} --verbose --similarity_to_quality_model /usr/local/share/visqol/libsvm_nu_svr_model.txt`,
	);
	const score = extractFirstNumberByRegex(
		output,
		/MOS-LQO:\s*(\d+(?:\.\d+)?)/i,
	);
	return score ?? 0;
}

async function runVqmt(
	runner: QoeCommandRunner,
	presenterYuv: string,
	viewerYuv: string,
	numberOfFrames: number,
	context: MetricFileContext,
): Promise<{
	msssim: number;
	psnr: number;
	psnrhvs: number;
	ssim: number;
	vifp: number;
	psnrhvsm: number;
}> {
	const prefixWithIndex = path.join(
		context.tmpDir,
		`${context.prefix}-${context.cutIndex}`,
	);
	await runner.runAndCapture(
		`vqmt ${runner.quote(presenterYuv)} ${runner.quote(viewerYuv)} ${context.width} ${context.height} ${numberOfFrames} 1 ${runner.quote(prefixWithIndex)} PSNR SSIM VIFP MSSSIM PSNRHVS PSNRHVSM`,
	);
	const [msssim, psnr, psnrhvs, ssim, vifp, psnrhvsm] = await Promise.all([
		parseCsvAverage(`${prefixWithIndex}_msssim.csv`, 1, true),
		parseCsvAverage(`${prefixWithIndex}_psnr.csv`, 1, true),
		parseCsvAverage(`${prefixWithIndex}_psnrhvs.csv`, 1, true),
		parseCsvAverage(`${prefixWithIndex}_ssim.csv`, 1, true),
		parseCsvAverage(`${prefixWithIndex}_vifp.csv`, 1, true),
		parseCsvAverage(`${prefixWithIndex}_psnrhvsm.csv`, 1, true),
	]);
	return {
		msssim,
		psnr,
		psnrhvs,
		ssim,
		vifp,
		psnrhvsm,
	};
}

async function runPesq(
	runner: QoeCommandRunner,
	presenterPesqWav: string,
	viewerPesqWav: string,
	context: MetricFileContext,
): Promise<number> {
	const output = await runner.runAndCapture(
		`pesq +${PESQ_SAMPLE_RATE} ${runner.quote(presenterPesqWav)} ${runner.quote(viewerPesqWav)}`,
	);
	const outFile = path.join(
		context.tmpDir,
		`${context.prefix}-${context.cutIndex}_pesq.txt`,
	);
	await fsPromises.writeFile(outFile, output, 'utf-8');

	// New: try to parse the compact P.862 line which contains both values, e.g.
	// "P.862 Prediction (Raw MOS, MOS-LQO):  = 3.620   3.715"
	let rawMos: number | null = null;
	let mosLq0: number | null = null;

	const p862Match =
		/P\.862 Prediction.*=\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i.exec(
			output,
		);
	if (p862Match) {
		const a = Number.parseFloat(p862Match[1]);
		const b = Number.parseFloat(p862Match[2]);
		rawMos = Number.isFinite(a) ? a : null;
		mosLq0 = Number.isFinite(b) ? b : null;
	} else {
		// Fallback to older labelled patterns
		rawMos = extractFirstNumberByRegex(
			output,
			/Raw MOS\s*=\s*(\d+(?:\.\d+)?)/i,
		);
		mosLq0 = extractFirstNumberByRegex(
			output,
			/MOS-LQO\s*=\s*(\d+(?:\.\d+)?)/i,
		);
	}

	if (rawMos !== null && mosLq0 !== null) {
		return (rawMos + mosLq0) / 2;
	}
	return 0;
}

async function parseCsvAverage(
	filePath: string,
	column: number,
	hasHeader: boolean,
): Promise<number> {
	const text = await fsPromises.readFile(filePath, 'utf-8');
	const lines = text
		.split(/\r?\n/u)
		.map(line => line.trim())
		.filter(line => line.length > 0);
	const dataLines = hasHeader ? lines.slice(1) : lines;
	if (dataLines.length === 0) {
		return 0;
	}
	let sum = 0;
	let count = 0;
	for (const line of dataLines) {
		const columns = line.split(',');
		if (columns.length <= column) {
			continue;
		}
		const value = Number.parseFloat(columns[column]);
		if (Number.isFinite(value)) {
			sum += value;
			count += 1;
		}
	}
	if (count === 0) {
		return 0;
	}
	return sum / count;
}

function normalize(value: number, min: number, max: number): number {
	const range = max - min;
	if (!Number.isFinite(value) || range <= 0) {
		return 0;
	}
	const normalized = (value - min) / range;
	if (normalized < 0) {
		return 0;
	}
	if (normalized > 1) {
		return 1;
	}
	return normalized;
}

function extractFirstNumberByRegex(
	output: string,
	regex: RegExp,
): number | null {
	const match = regex.exec(output);
	if (!match) {
		return null;
	}
	const parsed = Number.parseFloat(match[1]);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	return parsed;
}

function tryGetVmafFramesAverage(framesValue: unknown): number | null {
	if (!Array.isArray(framesValue) || framesValue.length === 0) {
		return null;
	}
	let sum = 0;
	let count = 0;
	for (const frame of framesValue) {
		if (typeof frame !== 'object' || frame === null) {
			continue;
		}
		const metrics = (frame as Record<string, unknown>).metrics;
		if (typeof metrics !== 'object' || metrics === null) {
			continue;
		}
		const vmaf = (metrics as Record<string, unknown>).vmaf;
		if (typeof vmaf !== 'number' || !Number.isFinite(vmaf)) {
			continue;
		}
		sum += vmaf;
		count += 1;
	}
	if (count === 0) {
		return null;
	}
	return sum / count;
}

function getVmafPooledMean(pooledMetricsValue: unknown): number {
	if (typeof pooledMetricsValue !== 'object' || pooledMetricsValue === null) {
		throw new TypeError('Invalid VMAF pooled metrics payload');
	}
	const vmafValue = (pooledMetricsValue as Record<string, unknown>).vmaf;
	if (typeof vmafValue !== 'object' || vmafValue === null) {
		throw new TypeError('Invalid VMAF pooled metrics.vmaf payload');
	}
	const mean = (vmafValue as Record<string, unknown>).mean;
	if (typeof mean !== 'number' || !Number.isFinite(mean)) {
		throw new TypeError('Invalid VMAF mean value');
	}
	return mean;
}
