import fs = require('fs');
import * as express from 'express';
import { Request, Response } from 'express';
import { exec } from 'child_process';
import { InitializePostRequest } from '../types/api-rest.type';
import { InstanceService } from '../services/instance.service';
import { ElasticSearchService } from '../services/elasticsearch.service';
import { APPLICATION_MODE } from '../config';
import { ApplicationMode } from '../types/config.type';
import { ContainerName } from '../types/container-info.type';

export const app = express.Router({
    strict: true
});

app.get('/ping', (req: Request, res: Response) => {
	res.status(200).send('Pong');
});

app.post('/restart', async (req: Request, res: Response) => {
	try {
		console.log('Restarting browser-emulator');
		res.status(200).send();
		exec('forever restartall');
	} catch (error) {
		res.status(500).send(error);
	}
});

app.post('/initialize', async (req: Request, res: Response) => {
	try {
		const request: InitializePostRequest = req.body;
		const isProdMode: boolean = APPLICATION_MODE === ApplicationMode.PROD;
		const instanceService = InstanceService.getInstance();
		const elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance();

		createRecordingsDirectory();

		console.log('Initialize browser-emulator');
		process.env.ELASTICSEARCH_HOSTNAME = request.elasticSearchHost;
		process.env.ELASTICSEARCH_USERNAME = request.elasticSearchUserName;
		process.env.ELASTICSEARCH_PASSWORD = request.elasticSearchPassword;

		if(isProdMode) {
			await elasticSearchService.initialize();
			try {
				await instanceService.launchMetricBeat();
			} catch (error) {
				console.log('Error starting metricbeat', error);
				if(error.statusCode === 409 && error.message.includes("Conflict")){
					console.log('Retrying ...');
					await instanceService.removeContainer(ContainerName.METRICBEAT);
					await instanceService.launchMetricBeat();
				}
			}
		}

		res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});

function createRecordingsDirectory() {
	var dir = `${process.env.PWD}/recordings`;
	if (!fs.existsSync(dir)){
		fs.mkdirSync(dir);
		fs.mkdirSync(dir + '/kms');
		fs.mkdirSync(dir + '/chrome');
	}
}