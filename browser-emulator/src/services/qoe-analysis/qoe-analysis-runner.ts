import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { getContainer } from '../../container.js';
import type { JSONQoeProcessing, JSONUserInfo } from '../../types/json.type.ts';
import { LocalFilesRepository } from '../../repositories/files/local-files.repository.ts';
import {
	getTimestamps,
	processAndUploadResults,
} from './qoe-results-ingestion.ts';
import type { QoeConfig } from '../../types/qoe-analysis/qoe-analysis.types.ts';
import baseLogger from '../../services/logger.service.ts';

const logger = baseLogger.child({ module: 'qoe-analysis-runner' });
export interface QoEAnalysisProgressCallbacks {
	onFileProcessed?: () => void;
	onCompleted?: () => void;
}

let nonBlockingCallbacks: QoEAnalysisProgressCallbacks | undefined;

export async function runQoEAnalysisNonBlocking(
	processingInfo: JSONQoeProcessing,
	qoeConfig?: QoeConfig,
	callbacks?: QoEAnalysisProgressCallbacks,
) {
	const files = await fsPromises
		.access(
			LocalFilesRepository.QOE_RECORDING_DIR,
			fs.constants.R_OK | fs.constants.W_OK,
		)
		.then(() => fsPromises.readdir(LocalFilesRepository.QOE_RECORDING_DIR));
	nonBlockingCallbacks = callbacks;
	void runQoEAnalysis(
		processingInfo,
		LocalFilesRepository.QOE_RECORDING_DIR,
		files,
		qoeConfig,
	)
		.then(() => {
			logger.info('Finished running QoE analysis');
			nonBlockingCallbacks?.onCompleted?.();
			nonBlockingCallbacks = undefined;
		})
		.catch(err => {
			logger.error({ err }, 'QoE analysis failed');
			nonBlockingCallbacks?.onCompleted?.();
			nonBlockingCallbacks = undefined;
		});
	return files;
}

async function setGlobalConcurrencyForRunner(maxCpus: number) {
	const container = await getContainer();
	const qoeCommandRunner = container.resolve('qoeCommandRunner');
	qoeCommandRunner.configureQoeGlobalLimiter(maxCpus);
	logger.info({ maxCpus }, 'QoE global concurrency set');
}

export async function runQoEAnalysisBlocking(
	processingInfo: JSONQoeProcessing,
	qoeConfig?: QoeConfig,
) {
	if (qoeConfig?.maxCpus) {
		await setGlobalConcurrencyForRunner(qoeConfig.maxCpus);
	}
	const files = await fsPromises
		.access(
			LocalFilesRepository.QOE_RECORDING_DIR,
			fs.constants.R_OK | fs.constants.W_OK,
		)
		.then(() => fsPromises.readdir(LocalFilesRepository.QOE_RECORDING_DIR));
	await runQoEAnalysis(
		processingInfo,
		LocalFilesRepository.QOE_RECORDING_DIR,
		files,
		qoeConfig,
	).then(() => {
		logger.info('Finished running QoE analysis');
	});
	return files;
}

async function runQoEAnalysis(
	processingInfo: JSONQoeProcessing,
	dir: string,
	files: string[],
	qoeConfig?: QoeConfig,
): Promise<void> {
	if (qoeConfig?.maxCpus) {
		await setGlobalConcurrencyForRunner(qoeConfig.maxCpus);
	}

	const elasticSearchService = await getElasticSearchService();
	let timestamps: JSONUserInfo[] = [];
	if (!qoeConfig?.onlyFiles) {
		if (
			!elasticSearchService.isElasticSearchRunning() &&
			!!processingInfo.elasticsearch_hostname
		) {
			await elasticSearchService.initialize(
				processingInfo.elasticsearch_hostname,
				processingInfo.elasticsearch_username,
				processingInfo.elasticsearch_password,
				processingInfo.index,
			);
		}
		timestamps = await getTimestamps(processingInfo);
	}
	const promises: Promise<string[]>[] = [];
	files.forEach(file => {
		if (!file.toLowerCase().endsWith('.webm')) {
			logger.debug({ file }, 'Skipping non-webm file');
			return;
		}
		const filePath = `${dir}/${file}`;
		const fileName = file.split('/').pop();
		if (!fileName) {
			logger.warn({ filePath }, 'Skipping invalid file path');
			return;
		}
		const prefix = fileName.split('.')[0];
		promises.push(
			runSingleAnalysis(filePath, fileName, processingInfo, qoeConfig)
				.then(() => {
					nonBlockingCallbacks?.onFileProcessed?.();
					if (!qoeConfig?.onlyFiles) {
						return readJSONFile(prefix);
					}
					return [];
				})
				.catch(err => {
					logger.error({ err }, 'QoE analysis single run failed');
					nonBlockingCallbacks?.onFileProcessed?.();
					return [];
				}),
		);
	});
	return Promise.all(promises).then(info => {
		if (!qoeConfig?.onlyFiles) {
			return processAndUploadResults(
				timestamps,
				info,
				processingInfo,
			).then(() => {
				logger.info('Finished uploading results to ELK');
			});
		}
	});
}

async function runSingleAnalysis(
	filePath: string,
	fileName: string,
	processingInfo: JSONQoeProcessing,
	qoeConfig?: QoeConfig,
): Promise<void> {
	const qoeInfo = fileName.split('.')[0].split('_');
	const session = qoeInfo[1];
	const userFrom = qoeInfo[2];
	const userTo = qoeInfo[3];
	const prefix = `v-${session}-${userFrom}-${userTo}`;
	const container = await getContainer();
	const qoeAnalyzerService = container.resolve('qoeAnalyzerService');
	await qoeAnalyzerService.analyzeFile({
		viewerPath: filePath,
		presenterPath: processingInfo.presenter_video_file_location,
		presenterAudioPath: processingInfo.presenter_audio_file_location,
		prefix,
		fragmentDurationSecs: Number(processingInfo.fragment_duration),
		paddingDurationSecs: Number(processingInfo.padding_duration),
		width: Number(processingInfo.width),
		height: Number(processingInfo.height),
		fps: processingInfo.framerate,
		qoeConfig,
	});
}

async function readJSONFile(prefix: string): Promise<string[]> {
	logger.info('Finished running script, reading JSON file...');
	const qoeInfo = prefix.split('_');
	const session = qoeInfo[1];
	const userFrom = qoeInfo[2];
	const userTo = qoeInfo[3];
	const filePrefix = `v-${session}-${userFrom}-${userTo}`;
	const jsonText = await fsPromises.readFile(
		filePrefix + '_cuts.json',
		'utf-8',
	);
	logger.info('JSON read');
	return [session, userFrom, userTo, jsonText];
}

async function getElasticSearchService() {
	const container = await getContainer();
	return container.resolve('elasticSearchService');
}

export { processFilesAndUploadResults } from './qoe-results-ingestion.ts';
