import type {
	JSONQoEInfo,
	JSONQoeProcessing,
	JSONUserInfo,
} from '../types/api-rest.type.js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import pLimit from 'p-limit';
import * as path from 'node:path';
import { getContainer } from '../container.js';
import { runScript } from './run-script.js';
import type { ChildProcess } from 'node:child_process';

const limit = pLimit(1); // Scripts are already multithreaded

function getElasticSearchService() {
	const container = getContainer();
	return container.resolve('elasticSearchService');
}

export async function runQoEAnalysisNonBlocking(
	processingInfo: JSONQoeProcessing,
) {
	const dir = `${process.cwd()}/recordings/qoe`;
	const files = await fsPromises
		.access(dir, fs.constants.R_OK | fs.constants.W_OK)
		.then(() => fsPromises.readdir(dir));
	void runQoEAnalysis(processingInfo, dir, files).then(() => {
		console.log('Finished running QoE analysis');
	});
	return files;
}

export async function runQoEAnalysisBlocking(
	processingInfo: JSONQoeProcessing,
	maxCpus?: number,
	onlyFiles = false,
	allAnalysis = false,
	debug = false,
) {
	const dir = `${process.cwd()}/recordings/qoe`;
	const files = await fsPromises
		.access(dir, fs.constants.R_OK | fs.constants.W_OK)
		.then(() => fsPromises.readdir(dir));
	await runQoEAnalysis(
		processingInfo,
		dir,
		files,
		maxCpus,
		onlyFiles,
		allAnalysis,
		debug,
	).then(() => {
		console.log('Finished running QoE analysis');
	});
	return files;
}

async function runQoEAnalysis(
	processingInfo: JSONQoeProcessing,
	dir: string,
	files: string[],
	maxCpus?: number,
	onlyFiles = false,
	allAnalysis = false,
	debug = false,
): Promise<void> {
	const elasticSearchService = getElasticSearchService();
	let timestamps: JSONUserInfo[] = [];
	if (!onlyFiles) {
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
		const filePath = `${dir}/${file}`;
		const fileName = file.split('/').pop();
		const prefix = fileName!.split('.')[0];
		promises.push(
			limit(() =>
				runSingleAnalysis(
					filePath,
					fileName!,
					processingInfo,
					maxCpus,
					allAnalysis,
					debug,
				)
					.then(() => {
						if (!onlyFiles) {
							return readJSONFile(prefix);
						}
						return [];
					})
					.catch(err => {
						console.error(err);
						return [];
					}),
			),
		);
	});
	return Promise.all(promises).then(info => {
		if (!onlyFiles) {
			return processAndUploadResults(
				timestamps,
				info,
				processingInfo,
			).then(() => {
				console.log('Finished uploading results to ELK');
			});
		}
	});
}

async function runSingleAnalysis(
	filePath: string,
	fileName: string,
	processingInfo: JSONQoeProcessing,
	maxCpus?: number,
	allAnalysis = false,
	debug = false,
): Promise<ChildProcess> {
	const qoeInfo = fileName.split('.')[0].split('_');
	const session = qoeInfo[1];
	const userFrom = qoeInfo[2];
	const userTo = qoeInfo[3];
	const prefix = `v-${session}-${userFrom}-${userTo}`;
	let maxCpusString = '';
	if (maxCpus !== undefined) {
		maxCpusString = ' --max_cpus ' + maxCpus;
	}
	let debugString = '';
	if (debug) {
		debugString = ' --debug';
	}
	let allAnalysisString = '';
	if (allAnalysis) {
		allAnalysisString = ' --all_analysis';
	}
	return runScript(
		`python3 ${process.cwd()}/qoe_scripts/qoe_analyzer.py --presenter ${processingInfo.presenter_video_file_location} --presenter_audio ${processingInfo.presenter_audio_file_location} --viewer ${filePath} --prefix ${prefix} --fragment_duration_secs ${processingInfo.fragment_duration} --padding_duration_secs ${processingInfo.padding_duration} --width ${processingInfo.width} --height ${processingInfo.height} --fps ${processingInfo.framerate}` +
			maxCpusString +
			debugString +
			allAnalysisString,
	);
}

async function readJSONFile(prefix: string): Promise<string[]> {
	console.log('Finished running script, reading JSON file...');
	const qoeInfo = prefix.split('_');
	const session = qoeInfo[1];
	const userFrom = qoeInfo[2];
	const userTo = qoeInfo[3];
	const filePrefix = `v-${session}-${userFrom}-${userTo}`;
	const jsonText = await fsPromises.readFile(
		filePrefix + '_cuts.json',
		'utf-8',
	);
	console.log('JSON read');
	return [session, userFrom, userTo, jsonText];
}

async function getTimestamps(processingInfo: JSONQoeProcessing) {
	if (processingInfo.timestamps && processingInfo.timestamps.length > 0) {
		console.log('Timestamps found in file');
		return processingInfo.timestamps;
	} else {
		console.log('Timestamps not found in file, searching ELK...');
		const elasticSearchService = getElasticSearchService();
		return await elasticSearchService.getStartTimes();
	}
}

type QoECut = JSONQoEInfo & { cut_index: number };

function isQoECut(value: unknown): value is QoECut {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return typeof record.cut_index === 'number';
}

function buildUserStartMap(
	timestamps: JSONUserInfo[],
): Record<string, Record<string, Date>> {
	const userStartMap: Record<string, Record<string, Date>> = {};
	for (const timestamp of timestamps) {
		const timestampSession = timestamp.new_participant_session;
		const timestampUserFrom = timestamp.new_participant_id;
		const timestampDate = new Date(timestamp['@timestamp']);
		userStartMap[timestampSession] ??= {};
		userStartMap[timestampSession][timestampUserFrom] = timestampDate;
	}
	return userStartMap;
}

function getVideoStart(
	userStartMap: Record<string, Record<string, Date>>,
	session: string,
	userFrom: string,
	userTo: string,
): number | null {
	const sessionUsers = userStartMap[session];
	if (!sessionUsers?.[userFrom] || !sessionUsers[userTo]) {
		console.error(
			`Could not find start time for session ${session} user ${userFrom} and user ${userTo}`,
		);
		return null;
	}
	const userFromDate = sessionUsers[userFrom].getTime();
	const userToDate = sessionUsers[userTo].getTime();
	return Math.max(userFromDate, userToDate);
}

function toQoEJsons(
	parsedJson: unknown[],
	session: string,
	userFrom: string,
	userTo: string,
	videoStart: number,
	processingInfo: JSONQoeProcessing,
): JSONQoEInfo[] {
	const results: JSONQoEInfo[] = [];
	for (const cut of parsedJson) {
		if (!isQoECut(cut)) {
			continue;
		}
		cut.session = session;
		cut.userFrom = userFrom;
		cut.userTo = userTo;
		const timestampDate = new Date(videoStart);
		timestampDate.setSeconds(
			timestampDate.getSeconds() +
				2 * processingInfo.padding_duration * (cut.cut_index + 1) +
				processingInfo.fragment_duration * (cut.cut_index + 1),
		);
		cut['@timestamp'] = timestampDate.toISOString();
		results.push(cut);
	}
	return results;
}

async function processAndUploadResults(
	timestamps: JSONUserInfo[],
	info: string[][],
	processingInfo: JSONQoeProcessing,
) {
	console.log('Finished running all scripts, processing results for ELK...');
	const userStartMap = buildUserStartMap(timestamps);
	const jsonsELK: JSONQoEInfo[] = [];

	for (const infoArray of info) {
		const session = infoArray[0];
		const userFrom = infoArray[1];
		const userTo = infoArray[2];
		const jsonText = infoArray[3];
		const parsedJson: unknown = JSON.parse(jsonText);

		if (!Array.isArray(parsedJson)) {
			console.error(
				`Invalid QoE JSON format for session ${session} user ${userFrom} and user ${userTo}`,
			);
			continue;
		}

		const videoStart = getVideoStart(
			userStartMap,
			session,
			userFrom,
			userTo,
		);
		if (videoStart === null) {
			continue;
		}

		jsonsELK.push(
			...toQoEJsons(
				parsedJson,
				session,
				userFrom,
				userTo,
				videoStart,
				processingInfo,
			),
		);
	}

	console.log(
		'Finished processing results for ELK, writing to ElasticSearch...',
	);
	const elasticSearchService = getElasticSearchService();
	return elasticSearchService.sendBulkJsons(jsonsELK);
}

export async function processFilesAndUploadResults(
	processingInfo: JSONQoeProcessing,
	processPath?: string,
) {
	if (!processingInfo.elasticsearch_hostname) {
		console.error(
			'Elasticsearch hostname and/or credentials not provided, cannot upload results',
		);
		return;
	}
	const elasticSearchService = getElasticSearchService();
	await elasticSearchService.initialize(
		processingInfo.elasticsearch_hostname,
		processingInfo.elasticsearch_username,
		processingInfo.elasticsearch_password,
		processingInfo.index,
	);
	const timestamps = await getTimestamps(processingInfo);
	let files = processPath
		? await fsPromises.readdir(processPath)
		: await fsPromises.readdir(process.cwd());
	files = files.filter(
		f =>
			path.extname(f).toLowerCase() === '.json' &&
			f.includes('_cuts.json'),
	);
	const filesInfo: string[][] = [];
	for (const file of files) {
		let prefix = file.split('_cuts')[0];
		const qoeInfo = prefix.split('-');
		const session = qoeInfo[1];
		const userFrom = qoeInfo[2];
		const userTo = qoeInfo[3];
		if (processPath) {
			prefix = processPath + prefix;
		}
		const jsonText = await fsPromises.readFile(
			prefix + '_cuts.json',
			'utf-8',
		);
		filesInfo.push([session, userFrom, userTo, jsonText]);
	}
	await processAndUploadResults(timestamps, filesInfo, processingInfo);
	console.log('Finished uploading results to ELK');
}
