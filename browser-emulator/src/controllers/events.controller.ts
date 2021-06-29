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

app.post('/webrtcStats', async (req: Request, res: Response) => {
	try {
		const statsResponse: JSONStatsResponse = req.body;
		// console.log("Client Stats received: ", statsResponse);
		// console.log("webrtc: ", statsResponse.webrtc_stats);
		await elasticSearchService.sendJson(statsResponse);
		return res.status(200).send();
	} catch (error) {
		console.log('ERROR sending stast to ES', error);
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
