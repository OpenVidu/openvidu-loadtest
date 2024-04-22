import fs = require('fs');
import * as express from 'express';
import { Request, Response } from 'express';
import { BrowserVideoRequest, CustomBrowserVideoRequest, InitializePostRequest } from '../types/api-rest.type';
import { InstanceService } from '../services/instance.service';
import { ElasticSearchService } from '../services/elasticsearch.service';
import { APPLICATION_MODE } from '../config';
import { ApplicationMode } from '../types/config.type';
import { ContainerName } from '../types/container-info.type';
import { QoeAnalyzerService } from '../services/qoe-analyzer.service';
import { FilesService } from '../services/files/files.service';
import { S3FilesService } from '../services/files/impl/s3.service';
import { MinioFilesService } from '../services/files/impl/minio.service';
import { downloadFile } from '../utils/download-files';
import { SeleniumService } from '../services/selenium.service';

export const app = express.Router({
	strict: true,
});

const MEDIAFILES_DIR = `${process.cwd()}/src/assets/mediafiles`;

app.get('/ping', (req: Request, res: Response) => {
	if (InstanceService.getInstance().isInstanceInitialized()) {
		res.status(200).send('Pong');
	} else {
		res.status(500).send();
	}
});

// app.post('/restart', async (req: Request, res: Response) => {
// 	try {
// 		console.log('Restarting browser-emulator');
// 		res.status(200).send();
// 		exec('forever restartall');
// 	} catch (error) {
// 		res.status(500).send(error);
// 	}
// });

app.post('/initialize', async (req: Request, res: Response) => {
	try {
		const request: InitializePostRequest = req.body;
		const isProdMode: boolean = APPLICATION_MODE === ApplicationMode.PROD;
		let filesService: FilesService;
		const elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance();

		createRecordingsDirectory();

		console.log('Initialize browser-emulator');

		const promises = []
		if (isProdMode) {
			if (!!request.browserVideo) {
				promises.push(downloadMediaFilesAndStartSeleniumService(request.browserVideo));
			}
			
			if (!elasticSearchService.isElasticSearchRunning()) {
				process.env.ELASTICSEARCH_HOSTNAME = request.elasticSearchHost;
				process.env.ELASTICSEARCH_USERNAME = request.elasticSearchUserName;
				process.env.ELASTICSEARCH_PASSWORD = request.elasticSearchPassword;
				if (!!request.elasticSearchIndex) {
					process.env.ELASTICSEARCH_INDEX = request.elasticSearchIndex;
				}
				promises.push(elasticSearchService.initialize(process.env.ELASTICSEARCH_INDEX));
				promises.push(launchMetricBeat());
			}

		}
		const fileServicePromise = new Promise((resolve, reject) => {
			if (!!request.minioHost && !!request.minioAccessKey && !!request.minioSecretKey) {
				process.env.MINIO_HOST = request.minioHost;
				process.env.MINIO_PORT = !!request.minioPort ? request.minioPort.toString() : '443';
				process.env.MINIO_BUCKET = request.minioBucket;
				filesService = MinioFilesService.getInstance(request.minioAccessKey, request.minioSecretKey);
			} else if (!!request.awsAccessKey && !!request.awsSecretAccessKey) {
				process.env.S3_BUCKET = request.s3BucketName;
				filesService = S3FilesService.getInstance(request.awsAccessKey, request.awsSecretAccessKey);
			}
			resolve('');
		}).then(() => {
			if (!!request.qoeAnalysis && request.qoeAnalysis.enabled) {
				process.env.QOE_ANALYSIS = request.qoeAnalysis.enabled.toString();
				QoeAnalyzerService.getInstance().setDurations(request.qoeAnalysis.fragment_duration, request.qoeAnalysis.padding_duration);
			}
		});
		promises.push(fileServicePromise);
		await Promise.all(promises);
		res.status(200).send(`Instance ${req.headers.host} has been initialized`);
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});

function createRecordingsDirectory() {
	const dir = `${process.cwd()}/recordings`;
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir);
		fs.mkdirSync(dir + '/kms');
		fs.mkdirSync(dir + '/chrome');
		fs.mkdirSync(dir + '/qoe');
	}
}

async function launchMetricBeat() {
	const instanceService = InstanceService.getInstance();
	try {
		await instanceService.launchMetricBeat();
	} catch (error) {
		console.log('Error starting metricbeat', error);
		if (error.statusCode === 409 && error.message.includes('Conflict')) {
			console.log('Retrying ...');
			await instanceService.removeContainer(ContainerName.METRICBEAT);
			await instanceService.launchMetricBeat();
		}
	}
}

async function downloadMediaFilesAndStartSeleniumService(videoType: BrowserVideoRequest): Promise<SeleniumService> {
	const fileNames = await Promise.all([
		downloadBrowserMediaFiles(videoType),
		downloadEmulatedFiles()
	])
	return SeleniumService.getInstance(fileNames[0][0], fileNames[0][1]);
}

async function downloadBrowserMediaFiles(videoType: BrowserVideoRequest): Promise<string[]> {
	if (videoType.videoInfo === undefined) {
		throw new Error('Missing video info in video request');
	}
	const videoInfo = videoType.videoInfo
	const videoFile = `fakevideo_${videoInfo.fps}fps_${videoInfo.width}x${videoInfo.height}.y4m`
	const videoUrl = videoType.videoType === "custom" ? videoType.customVideo.video.url : `https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}_${videoInfo.height}p_${videoInfo.fps}fps.y4m`
	const audioFile = `fakeaudio.wav`
	const audioUrl = videoType.videoType === "custom" ? videoType.customVideo.audioUrl : `https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}.wav`
	const promises = [
			downloadFile(videoFile, videoUrl, MEDIAFILES_DIR),
			downloadFile(audioFile, audioUrl, MEDIAFILES_DIR)
		]
	return Promise.all(promises)
}

async function downloadEmulatedFiles(): Promise<string[]> {
	return Promise.all([
		downloadFile("video_640x480.mkv", "https://s3.eu-west-1.amazonaws.com/public.openvidu.io/bbb_640x480.mkv", MEDIAFILES_DIR).then(() => "video_640x480.mkv"),
		downloadFile("video_1280x720.mkv", "https://s3.eu-west-1.amazonaws.com/public.openvidu.io/bbb_1280x720.mkv", MEDIAFILES_DIR).then(() => "video_1280x720.mkv")
	]);
}

