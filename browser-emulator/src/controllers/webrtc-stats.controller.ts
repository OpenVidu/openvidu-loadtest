import * as express from 'express';
import { Request, Response } from 'express';
import { ElasticSearchService } from '../services/elasticsearch.service';
import { JSONStatsResponse } from '../types/api-rest.type';
require("util").inspect.defaultOptions.depth = null;
export const app = express.Router({
    strict: true
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
		console.log("ERROR sending stast to ES", error);
		res.status(500).send(error);
	}
});