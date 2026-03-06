import * as express from 'express';
import type { Response } from 'express';
import type {
	BrowserEventRequest,
	WebRTCStatsRequest,
} from '../types/api-rest.type.js';
import type { ElasticSearchService } from '../services/elasticsearch.service.js';
import type { WsService } from '../services/ws.service.js';
import {
	ERRORS_FILE,
	EVENTS_FILE,
	STATS_FILE,
	addSaveStatsToFileToQueue,
} from '../utils/stats-files.js';

// DEBUG: Print full objects (only uncomment for debug sessions during development)
// require("util").inspect.defaultOptions.depth = null;

export class EventsController {
	private readonly router: express.Router;
	private readonly elasticSearchService: ElasticSearchService;
	private readonly wsService: WsService;

	constructor(
		elasticSearchService: ElasticSearchService,
		wsService: WsService,
	) {
		this.elasticSearchService = elasticSearchService;
		this.wsService = wsService;
		this.router = express.Router({ strict: true });
		this.setupRoutes();
	}

	private setupRoutes(): void {
		this.router.post('/webrtcStats', this.handleWebRtcStats.bind(this));
		this.router.post('/events', this.handleEvents.bind(this));
		this.router.post('/events/errors', this.handleEventsErrors.bind(this));
	}

	private async handleWebRtcStats(
		req: WebRTCStatsRequest,
		res: Response,
	): Promise<void> {
		try {
			const statsResponse = req.body;
			addSaveStatsToFileToQueue(
				statsResponse.user,
				statsResponse.session,
				STATS_FILE,
				statsResponse,
			);
			// Send the stats to ElasticSearch
			if (this.elasticSearchService.isElasticSearchRunning()) {
				await this.elasticSearchService.sendJson(statsResponse);
			}
			res.status(200).send();
		} catch (error) {
			console.log('ERROR saving stats', error);
			res.status(500).send(error);
		}
	}

	private handleEvents(req: BrowserEventRequest, res: Response): void {
		try {
			const message: string = JSON.stringify(req.body);
			this.wsService.send(message);

			addSaveStatsToFileToQueue(
				req.body.participant,
				req.body.session,
				EVENTS_FILE,
				req.body,
			);

			res.status(200).send();
		} catch (error) {
			console.error(error);
			res.status(500).send(error);
		}
	}

	private handleEventsErrors(req: BrowserEventRequest, res: Response): void {
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

			res.status(200).send();
		} catch (error) {
			console.error(error);
			res.status(500).send(error);
		}
	}

	public getRouter(): express.Router {
		return this.router;
	}
}
