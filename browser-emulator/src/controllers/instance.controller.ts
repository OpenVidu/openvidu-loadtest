import fs from 'fs';
import * as express from 'express';
import type { Request, Response } from 'express';
import type { BrowserVideoRequest, InitializePostRequest } from '../types/api-rest.type.js';
import { InstanceService } from '../services/instance.service.js';
import { ElasticSearchService } from '../services/elasticsearch.service.js';
import { APPLICATION_MODE } from '../config.js';
import { ApplicationMode } from '../types/config.type.js';
import { ContainerName } from '../types/container-info.type.js';
import { QoeAnalyzerService } from '../services/qoe-analyzer.service.js';
import { S3FilesService } from '../services/files/impl/s3.service.js';
import { downloadFile } from '../utils/download-files.js';
import { SeleniumService } from '../services/selenium.service.js';

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
		const elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance();

		createRecordingsDirectory();

		console.log('Initialize browser-emulator');

		const promises = []
		if (isProdMode) {
            promises.push(downloadMediaFilesAndStartSeleniumService(request.browserVideo));
			
			if (!!request.elasticSearchHost && !elasticSearchService.isElasticSearchRunning()) {
				promises.push(elasticSearchService.initialize(request.elasticSearchHost, request.elasticSearchUserName, request.elasticSearchPassword, request.elasticSearchIndex));
				promises.push(launchMetricBeat(request.elasticSearchHost, request.elasticSearchUserName, request.elasticSearchPassword));
			}

		}
        // Set up file service now for speed gains when uploading files later
		const fileServicePromise = new Promise((resolve, _) => {
            let accessKey: string | undefined;
            let secretAccessKey: string | undefined;
            let bucketName: string | undefined;
            let host: string | undefined;
			if (!!request.minioHost && !!request.minioAccessKey && !!request.minioSecretKey) {
                host = `${request.minioHost}:${!!request.minioPort ? request.minioPort.toString() : '443'}`;
				bucketName = request.minioBucket;
                accessKey = request.minioAccessKey;
                secretAccessKey = request.minioSecretKey;
			} else if (!!request.awsAccessKey && !!request.awsSecretAccessKey) {
                accessKey = request.awsAccessKey;
                secretAccessKey = request.awsSecretAccessKey;
				bucketName = request.s3BucketName;
			}
            if (!!request.s3Host) {
                host = request.s3Host;
            }
            if (!!bucketName && !!accessKey && !!secretAccessKey) {
                if (!!host) {
			        S3FilesService.getInstance(accessKey, secretAccessKey, bucketName, host);
                } else {
                    S3FilesService.getInstance(accessKey, secretAccessKey, bucketName);
                }
            }
			resolve('');
		}).then(() => {
            // TODO: this QOE_ANALYSIS should not be an env variable, there should be two separate properties: one to enable MediaRecorders in browser creation request and another one to actually do the QoE Analysis in situ
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
		fs.mkdirSync(dir + '/chrome');
		fs.mkdirSync(dir + '/qoe');
	}
}

async function launchMetricBeat(elasticsearchHost: string, elasticsearchUsername?: string, elasticsearchPassword?: string) {
	const instanceService = InstanceService.getInstance();
	try {
		await instanceService.launchMetricBeat(elasticsearchHost, elasticsearchUsername, elasticsearchPassword);
		} catch (error: any) {
		console.log('Error starting metricbeat', error);
		if (error.statusCode === 409 && error.message.includes('Conflict')) {
			console.log('Retrying ...');
			await instanceService.removeContainer(ContainerName.METRICBEAT);
			await instanceService.launchMetricBeat(elasticsearchHost, elasticsearchUsername, elasticsearchPassword);
		}
	}
}

async function downloadMediaFilesAndStartSeleniumService(videoType: BrowserVideoRequest): Promise<SeleniumService> {
	const fileNames = await downloadBrowserMediaFiles(videoType);
	return SeleniumService.getInstance(fileNames[0], fileNames[1]);
}

async function downloadBrowserMediaFiles(videoType: BrowserVideoRequest): Promise<string[]> {
	const videoInfo = videoType.videoType !== "custom" ? videoType.videoInfo : videoType.customVideo.video;
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
