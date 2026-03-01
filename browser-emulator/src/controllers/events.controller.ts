import * as express from 'express';
import type { Response } from 'express';
import { ElasticSearchService } from '../services/elasticsearch.service.js';
import { WsService } from '../services/ws.service.js';
import type {
	BrowserEventRequest,
	WebRTCStatsRequest,
} from '../types/api-rest.type.js';
import {
	ERRORS_FILE,
	EVENTS_FILE,
	STATS_FILE,
	addSaveStatsToFileToQueue,
} from '../utils/stats-files.js';

// DEBUG: Print full objects (only uncomment for debug sessions during development)
// require("util").inspect.defaultOptions.depth = null;

export const app = express.Router({
	strict: true,
});

const elasticSearchService: ElasticSearchService =
	ElasticSearchService.getInstance();

app.post('/webrtcStats', async (req: WebRTCStatsRequest, res: Response) => {
	try {
		const statsResponse = req.body;
		addSaveStatsToFileToQueue(
			statsResponse.user,
			statsResponse.session,
			STATS_FILE,
			statsResponse,
		);
		// Send the stats to ElasticSearch
		if (elasticSearchService.isElasticSearchRunning()) {
			await elasticSearchService.sendJson(statsResponse);
		}
		return res.status(200).send();
	} catch (error) {
		console.log('ERROR saving stats', error);
		res.status(500).send(error);
	}
});

app.post('/events', (req: BrowserEventRequest, res: Response) => {
	try {
		const message: string = JSON.stringify(req.body);
		WsService.getInstance().send(message);

		addSaveStatsToFileToQueue(
			req.body.participant,
			req.body.session,
			EVENTS_FILE,
			req.body,
		);

		return res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});

app.post('/events/errors', (req: BrowserEventRequest, res: Response) => {
	try {
		const message: string = JSON.stringify(req.body);

		console.error('Error received from browser: ');
		console.error(message);

		addSaveStatsToFileToQueue(
			req.body.participant,
			req.body.session,
			ERRORS_FILE,
			req.body,
		);

		return res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});
