import * as express from 'express';
import { Request, Response } from 'express';
import { ElasticSearchService } from '../services/elasticsearch.service';
import { WsService } from '../services/ws.service';
import { JSONStatsResponse } from '../types/api-rest.type';
import { ERRORS_FILE, EVENTS_FILE, STATS_FILE, createFile, saveStatsToFile } from '../utils/stats-files';

// DEBUG: Print full objects (only uncomment for debug sessions during development)
// require("util").inspect.defaultOptions.depth = null;

export const app = express.Router({
	strict: true,
});

const elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance();

app.post('/webrtcStats', async (req: Request, res: Response) => {
	try {
		const statsResponse: JSONStatsResponse = req.body;
		const promises = [];
		// Save the stats to file
		promises.push(saveStatsToFile(statsResponse.user, statsResponse.session, STATS_FILE, statsResponse));
		// Send the stats to ElasticSearch
		if (elasticSearchService.isElasticSearchRunning()) {
			promises.push(elasticSearchService.sendJson(statsResponse));
		}
		await Promise.all(promises);
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

		await saveStatsToFile(req.body.participant, req.body.session, EVENTS_FILE, req.body);

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

		await saveStatsToFile(req.body.participant, req.body.session, ERRORS_FILE, req.body);

		return res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});
