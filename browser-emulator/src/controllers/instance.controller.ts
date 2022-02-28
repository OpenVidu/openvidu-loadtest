import fs = require('fs');
import * as express from 'express';
import { Request, Response } from 'express';
import { InitializePostRequest } from '../types/api-rest.type';
import { InstanceService } from '../services/instance.service';
import { ElasticSearchService } from '../services/elasticsearch.service';
import { APPLICATION_MODE } from '../config';
import { ApplicationMode } from '../types/config.type';
import { ContainerName } from '../types/container-info.type';

export const app = express.Router({
	strict: true,
});

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
		const instanceService = InstanceService.getInstance();
		const elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance();

		createRecordingsDirectory();

		console.log('Initialize browser-emulator');

		if (isProdMode && !!request.qoeAnalysis) {
			process.env.QOE_ANALYSIS = request.qoeAnalysis;
		}

		if (isProdMode && !elasticSearchService.isElasticSearchRunning()) {
			process.env.ELASTICSEARCH_HOSTNAME = request.elasticSearchHost;
			process.env.ELASTICSEARCH_USERNAME = request.elasticSearchUserName;
			process.env.ELASTICSEARCH_PASSWORD = request.elasticSearchPassword;
			if (!!request.elasticSearchIndex) {
				process.env.ELASTICSEARCH_INDEX = request.elasticSearchIndex;
			}
			await elasticSearchService.initialize(process.env.ELASTICSEARCH_INDEX);
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

		if (isProdMode && !!request.awsAccessKey && !!request.awsSecretAccessKey) {
			process.env.S3_BUCKET = request.s3BucketName;
			createAWSConfigFile(request.awsAccessKey, request.awsSecretAccessKey);
		}

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

function createAWSConfigFile(awsAccessKey: string, awsSecretAccessKey: string) {
	const instanceService = InstanceService.getInstance();

	const awsConfig = { accessKeyId: awsAccessKey, secretAccessKey: awsSecretAccessKey, region: 'us-east-1' };
	if (fs.existsSync(instanceService.AWS_CREDENTIALS_PATH)) {
		fs.rmSync(instanceService.AWS_CREDENTIALS_PATH, { recursive: true, force: true });
	}
	fs.mkdirSync(instanceService.AWS_CREDENTIALS_PATH, {recursive: true});
	fs.writeFileSync(`${instanceService.AWS_CREDENTIALS_PATH}/config.json`, JSON.stringify(awsConfig));
	console.log('Created aws credentials file');
}
