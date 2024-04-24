import * as express from 'express';
import { Request, Response } from 'express';
import { ElasticSearchService } from '../services/elasticsearch.service';
import { WsService } from '../services/ws.service';
import { JSONStatsResponse } from '../types/api-rest.type';
import { createFileAndLock, saveStatsToFile } from '../utils/stats-files';

// DEBUG: Print full objects (only uncomment for debug sessions during development)
// require("util").inspect.defaultOptions.depth = null;

export const app = express.Router({
	strict: true,
});

const elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance();

const statsBuffer: JSONStatsResponse[] = [];
let sendInterval: NodeJS.Timeout;

const statsFile = `stats.json`;
const eventsFile = `events.json`;
const errorsFile = `errors.json`;

createFileAndLock(statsFile);
createFileAndLock(eventsFile);
createFileAndLock(errorsFile);

export const saveStats = async () => {
	if (statsBuffer.length > 0) {
		const promises = [];
		// Save the stats to file
		promises.push(saveStatsToFile(statsFile, statsBuffer));
		// Send the stats to ElasticSearch
		if (elasticSearchService.isElasticSearchRunning()) {
			promises.push(elasticSearchService.sendBulkJsons(statsBuffer));
		}
		await Promise.all(promises);
		statsBuffer.length = 0; // Clear the buffer
	}
}

const randomTimeoutSend = async () => {
	return new Promise<void>((resolve, reject) => {
		setTimeout(() => {
			try {
				saveStats();
				resolve();
			} catch (error) {
				reject(error);
			}
		}, getRandomDelay());
	});
}

const getRandomDelay = () => {
	const minDelay = 0; // Minimum delay in milliseconds
	const maxDelay = 10000; // Maximum delay in milliseconds
	return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
};

const startSendingStats = () => {
	sendInterval = setInterval(async () => {
		await randomTimeoutSend();
	}, 30000);
};

startSendingStats();

app.get('/events/forcesave', async (req: Request, res: Response) => {
	try {
		await saveStats();
		return res.status(200).send();
	} catch (error) {
		console.error('ERROR saving stats', error);
		return res.status(500).send(error);
	}
});

app.get('/events/savedstats', async (req: Request, res: Response) => {
	try {
		return res.status(200).send(statsBuffer.toString());
	} catch (error) {
		console.error('ERROR saving stats', error);
		return res.status(500).send(error);
	}
});

app.post('/webrtcStats', async (req: Request, res: Response) => {
	try {
		const statsResponse: any = req.body;
		if (Array.isArray(statsResponse)) {
			statsBuffer.push(...statsResponse);
		} else {
			statsBuffer.push(statsResponse);
		}

		return res.status(200).send();
	} catch (error) {
		console.log('ERROR saving stats', error);
		res.status(500).send(error);
	}
});

app.post('/events', async (req: Request, res: Response) => {
	try {
		const message: string = JSON.stringify(req.body);
		WsService.getInstance().send(message);

		await saveStatsToFile(eventsFile, req.body);

		return res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});

app.post('/events/errors', async (req: Request, res: Response) => {
	try {
		const message: string = JSON.stringify(req.body);

		console.error("Error received from browser: ");
		console.error(message);

		await saveStatsToFile(errorsFile, req.body);

		return res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});
