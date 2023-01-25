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
import { FilesService } from '../services/files.service';
import { S3FilesService } from '../services/s3.service';
import { MinioFilesService } from '../services/minio.service';
import { downloadFile } from '../utils/download-files';

export const app = express.Router({
	strict: true,
});

const MEDIAFILES_DIR = `${process.env.PWD}/src/assets/mediafiles`;

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
				promises.push(downloadMediaFiles(request.browserVideo));
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
	const dir = `${process.env.PWD}/recordings`;
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

async function downloadMediaFiles(videoType: BrowserVideoRequest) {
	return Promise.all([
		downloadBrowserMediaFiles(videoType),
		downloadEmulatedFiles()
	])
}

async function downloadBrowserMediaFiles(videoType: BrowserVideoRequest) {
	if (videoType.videoType === "bunny" || videoType.videoType === "interview" || videoType.videoType === "game") {
		return downloadBasicTypeMediaFiles(videoType);
	} else {
		const promises = videoType.videoType.videos.map(video => {
			return downloadFile(`fakevideo_${video.fps}fps_${video.width}x${video.height}.y4m`, video.url, MEDIAFILES_DIR);
		})
		promises.push(downloadFile('fakeaudio.wav', videoType.videoType.audioUrl, MEDIAFILES_DIR));
		return Promise.all(promises)
	}
}

async function downloadBasicTypeMediaFiles(videoType: BrowserVideoRequest) {
	if (videoType.videoInfo === undefined || videoType.videoInfo.length <= 0) {
		throw new Error('Missing video info in video request');
	}
	const promises = videoType.videoInfo.map((info) => {
		return downloadFile(`fakevideo_${info.fps}fps_${info.width}x${info.height}.y4m`,
			`https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}_${info.height}p_${info.fps}fps.y4m`, MEDIAFILES_DIR);
	})
	promises.push(downloadFile('fakeaudio.wav', `https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}.wav`, MEDIAFILES_DIR))
	return Promise.all(promises)
}

async function downloadEmulatedFiles() {
	return Promise.all([
		downloadFile("video_640x480.mkv", "https://s3.eu-west-1.amazonaws.com/public.openvidu.io/bbb_640x480.mkv", MEDIAFILES_DIR),
		downloadFile("video_1280x720.mkv", "https://s3.eu-west-1.amazonaws.com/public.openvidu.io/bbb_1280x720.mkv", MEDIAFILES_DIR)
	]);
}

