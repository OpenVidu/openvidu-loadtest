import * as express from 'express';
import { Request, Response } from 'express';
import { ElasticSearchService } from '../services/elasticsearch.service';

export const app = express.Router({
    strict: true
});

const elasticSearchService: ElasticSearchService = new ElasticSearchService();

app.post('/webrtcStats', async (req: Request, res: Response) => {
	try {
		console.log("Client Stats received: ", req.body);
		await elasticSearchService.sendJson(req.body);
		return res.status(200).send();
	} catch (error) {
		console.log("ERROR sending stast to ES", error);
		res.status(500).send(error);
	}
});