import fs from 'node:fs';
import * as express from 'express';
import type { Request, Response } from 'express';
import { getContainer } from '../container.js';
import type {
	BrowserVideo,
	InitializePost,
	InitializePostRequest,
} from '../types/api-rest.type.js';
import { APPLICATION_MODE } from '../config.js';
import { ApplicationMode } from '../types/config.type.js';
import { ContainerName } from '../types/container-info.type.js';
import { downloadFile } from '../utils/download-files.js';
import { SeleniumService } from '../services/selenium.service.js';
import type { S3FilesService } from '../services/files/s3files.service.ts';

export const app = express.Router({
	strict: true,
});

const MEDIAFILES_DIR = `${process.cwd()}/src/assets/mediafiles`;

app.get('/ping', (_: Request, res: Response) => {
	const container = getContainer();
	const instanceService = container.resolve('instanceService');
	if (instanceService.isInstanceInitialized()) {
		res.status(200).send('Pong');
	} else {
		res.status(500).send();
	}
});

// TODO: this should be divided into multiple endpoints, as it is doing multiple things (initializing different services, downloading media files, etc)
// TODO: study if browser could have its own video and audio, it would probably require multiple ffmpeg instances with multiple fake devices
app.post('/initialize', async (req: InitializePostRequest, res: Response) => {
	try {
		const request: InitializePost = req.body;
		const isProdMode: boolean = APPLICATION_MODE === ApplicationMode.PROD;
		const container = getContainer();
		const elasticSearchService = container.resolve('elasticSearchService');

		createRecordingsDirectory();

		console.log('Initialize browser-emulator');

		const promises = [];
		if (isProdMode) {
			promises.push(
				downloadMediaFilesAndStartSeleniumService(request.browserVideo),
			);

			if (
				request.elasticSearchHost &&
				!elasticSearchService.isElasticSearchRunning()
			) {
				promises.push(
					elasticSearchService.initialize(
						request.elasticSearchHost,
						request.elasticSearchUserName,
						request.elasticSearchPassword,
						request.elasticSearchIndex,
					),
					launchMetricBeat(
						request.elasticSearchHost,
						request.elasticSearchUserName,
						request.elasticSearchPassword,
					),
				);
			}
		}
		// Set up file service if possible now so that it doesn't have to be initialized later when needed
		const fileServicePromise = new Promise(resolve => {
			let accessKey: string | undefined;
			let secretAccessKey: string | undefined;
			const bucketName = request.s3BucketName;
			let host: string | undefined;
			if (request.awsAccessKey && request.awsSecretAccessKey) {
				accessKey = request.awsAccessKey;
				secretAccessKey = request.awsSecretAccessKey;
			}
			if (request.s3Host) {
				host = request.s3Host;
				if (request.s3HostAccessKey && request.s3HostSecretAccessKey) {
					// Overwrite accessKey and secretAccessKey if s3Host is provided with its own credentials,
					// as they should be used instead of AWS credentials to connect to the provided s3Host
					accessKey = request.s3HostAccessKey;
					secretAccessKey = request.s3HostSecretAccessKey;
				}
			}
			if (bucketName && accessKey && secretAccessKey) {
				const container = getContainer();
				const s3FilesService: S3FilesService =
					container.resolve('s3FilesService');
				s3FilesService.initialize(
					accessKey,
					secretAccessKey,
					bucketName,
					request.s3Region,
					host,
				);
			}
			resolve('');
		}).then(() => {
			// TODO: this QOE_ANALYSIS should not be an env variable, there should be two separate properties: one to enable MediaRecorders in browser creation request and another one to actually do the QoE Analysis in situ
			if (request.qoeAnalysis?.enabled) {
				const qoeContainer = getContainer();
				const qoeAnalyzerService =
					qoeContainer.resolve('qoeAnalyzerService');
				process.env.QOE_ANALYSIS =
					request.qoeAnalysis.enabled.toString();
				qoeAnalyzerService.setDurations(
					request.qoeAnalysis.fragment_duration,
					request.qoeAnalysis.padding_duration,
				);
			}
		});
		promises.push(fileServicePromise);
		await Promise.all(promises);
		res.status(200).send(
			`Instance ${req.headers.host} has been initialized`,
		);
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});

function createRecordingsDirectory() {
	const dir = `${process.cwd()}/recordings`;
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir);
		fs.mkdirSync(dir + '/chrome');
		fs.mkdirSync(dir + '/qoe');
	}
}

async function launchMetricBeat(
	elasticsearchHost: string,
	elasticsearchUsername?: string,
	elasticsearchPassword?: string,
) {
	const container = getContainer();
	const instanceService = container.resolve('instanceService');
	try {
		await instanceService.launchMetricBeat(
			elasticsearchHost,
			elasticsearchUsername,
			elasticsearchPassword,
		);
	} catch (error: unknown) {
		console.log('Error starting metricbeat', error);
		const err = error as { statusCode?: number; message: string };
		if (err.statusCode === 409 && err.message.includes('Conflict')) {
			console.log('Retrying ...');
			await instanceService.removeContainer(ContainerName.METRICBEAT);
			await instanceService.launchMetricBeat(
				elasticsearchHost,
				elasticsearchUsername,
				elasticsearchPassword,
			);
		}
	}
}

async function downloadMediaFilesAndStartSeleniumService(
	videoType: BrowserVideo,
): Promise<SeleniumService> {
	const fileNames = await downloadBrowserMediaFiles(videoType);
	const container = getContainer();
	const seleniumService = container.resolve('seleniumService');
	await seleniumService.initialize(fileNames[0], fileNames[1]);
	return seleniumService;
}

async function downloadBrowserMediaFiles(
	videoType: BrowserVideo,
): Promise<string[]> {
	const videoInfo =
		videoType.videoType === 'custom'
			? videoType.customVideo.video
			: videoType.videoInfo;
	const videoFile = `fakevideo_${videoInfo.fps}fps_${videoInfo.width}x${videoInfo.height}.y4m`;
	const videoUrl =
		videoType.videoType === 'custom'
			? videoType.customVideo.video.url
			: `https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}_${videoInfo.height}p_${videoInfo.fps}fps.y4m`;
	const audioFile = `fakeaudio.wav`;
	const audioUrl =
		videoType.videoType === 'custom'
			? videoType.customVideo.audioUrl
			: `https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}.wav`;
	const promises = [
		downloadFile(videoFile, videoUrl, MEDIAFILES_DIR),
		downloadFile(audioFile, audioUrl, MEDIAFILES_DIR),
	];
	return Promise.all(promises);
}
