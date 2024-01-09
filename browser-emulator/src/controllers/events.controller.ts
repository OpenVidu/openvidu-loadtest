import * as express from 'express';
import { Request, Response } from 'express';
import { ElasticSearchService } from '../services/elasticsearch.service';
import { WsService } from '../services/ws.service';
import { JSONStatsResponse } from '../types/api-rest.type';

// DEBUG: Print full objects (only uncomment for debug sessions during development)
// require("util").inspect.defaultOptions.depth = null;

export const app = express.Router({
	strict: true,
});

const elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance();

const statsBuffer: JSONStatsResponse[] = [];
let sendInterval: NodeJS.Timeout;

const randomTimeoutSend = () => {
	return new Promise<void>((resolve, reject) => {
		setTimeout(() => {
				if (statsBuffer.length > 0) {
					elasticSearchService.sendBulkJsons(statsBuffer).then(() => {
						statsBuffer.length = 0; // Clear the buffer
						resolve();
					}).catch((error) => {
						console.log('ERROR sending stats to ES', error);
						reject(error);
					});
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

app.post('/webrtcStats', async (req: Request, res: Response) => {
	try {
		const statsResponse: JSONStatsResponse | JSONStatsResponse[] = req.body;
		if (Array.isArray(statsResponse)) {
			statsBuffer.push(...statsResponse);
		} else {
			statsBuffer.push(statsResponse);
		}

		return res.status(200).send();
	} catch (error) {
		console.log('ERROR sending stats to ES', error);
		res.status(500).send(error);
	}
});

app.post('/events', (req: Request, res: Response) => {
	try {
		const message: string = JSON.stringify(req.body);
		WsService.getInstance().send(message);

		return res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});

app.post('/events/errors', (req: Request, res: Response) => {
	try {
		const message: string = JSON.stringify(req.body);

		console.error("Error received from browser: ");
		console.error(message);

		return res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});
