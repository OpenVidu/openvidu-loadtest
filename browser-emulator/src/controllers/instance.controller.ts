import fs from 'node:fs';
import * as express from 'express';
import type { Request, Response } from 'express';
import type {
	BrowserVideoRequest,
	InitializePostRequest,
} from '../types/api-rest.type.js';
import { InstanceService } from '../services/instance.service.js';
import { ElasticSearchService } from '../services/elasticsearch.service.js';
import { APPLICATION_MODE } from '../config.js';
import { ApplicationMode } from '../types/config.type.js';
import { ContainerName } from '../types/container-info.type.js';
import { QoeAnalyzerService } from '../services/qoe-analyzer.service.js';
import { downloadFile } from '../utils/download-files.js';
import { SeleniumService } from '../services/selenium.service.js';
import { S3FilesService } from '../services/files/s3files.service.ts';

export const app = express.Router({
	strict: true,
});

const MEDIAFILES_DIR = `${process.cwd()}/src/assets/mediafiles`;

app.get('/ping', (_: Request, res: Response) => {
	if (InstanceService.getInstance().isInstanceInitialized()) {
		res.status(200).send('Pong');
	} else {
		res.status(500).send();
	}
});

app.post('/initialize', async (req: Request, res: Response) => {
	try {
		const request: InitializePostRequest = req.body;
		const isProdMode: boolean = APPLICATION_MODE === ApplicationMode.PROD;
		const elasticSearchService: ElasticSearchService =
			ElasticSearchService.getInstance();

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
		// Set up file service now so that it doesn't have to be initialized later when needed
		const fileServicePromise = new Promise((resolve, _) => {
			let accessKey: string | undefined;
			let secretAccessKey: string | undefined;
			let bucketName = request.s3BucketName;
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
				S3FilesService.getInstance(
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
				process.env['QOE_ANALYSIS'] =
					request.qoeAnalysis.enabled.toString();
				QoeAnalyzerService.getInstance().setDurations(
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
	const instanceService = InstanceService.getInstance();
	try {
		await instanceService.launchMetricBeat(
			elasticsearchHost,
			elasticsearchUsername,
			elasticsearchPassword,
		);
	} catch (error: any) {
		console.log('Error starting metricbeat', error);
		if (error.statusCode === 409 && error.message.includes('Conflict')) {
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
	videoType: BrowserVideoRequest,
): Promise<SeleniumService> {
	const fileNames = await downloadBrowserMediaFiles(videoType);
	return SeleniumService.getInstance(fileNames[0], fileNames[1]);
}

async function downloadBrowserMediaFiles(
	videoType: BrowserVideoRequest,
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
