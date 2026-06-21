import * as express from 'express';
import type { Response } from 'express';
import type { ElasticSearchService } from '../services/elasticsearch.service.js';
import type { LoggerService } from '../services/logger.service.js';
import type { WsService } from '../services/ws.service.js';
import {
	ERRORS_FILE,
	EVENTS_FILE,
	STATS_FILE,
	addSaveStatsToFileToQueue,
} from '../utils/stats-files.js';
import type { WebRTCStatsRequest } from '../types/webrtc-stats.type.ts';
import type { BrowserEventRequest } from '../types/browser-event.type.ts';

export class EventsController {
	private readonly router: express.Router;
	private readonly elasticSearchService: ElasticSearchService;
	private readonly wsService: WsService;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	constructor(
		elasticSearchService: ElasticSearchService,
		wsService: WsService,
		loggerService: LoggerService,
	) {
		this.elasticSearchService = elasticSearchService;
		this.wsService = wsService;
		this.logger = loggerService.getLogger('EventsController');
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
			this.logger.error(error, 'ERROR saving stats');
			res.status(500).send('Internal server error');
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
			this.logger.error(error);
			res.status(500).send('Internal server error');
		}
	}

	private handleEventsErrors(req: BrowserEventRequest, res: Response): void {
		try {
			const message: string = JSON.stringify(req.body);

			this.logger.error('Error received from browser: %s', message);

			addSaveStatsToFileToQueue(
				req.body.participant,
				req.body.session,
				ERRORS_FILE,
				req.body,
			);

			res.status(200).send();
		} catch (error) {
			this.logger.error(error);
			res.status(500).send('Internal server error');
		}
	}

	public getRouter(): express.Router {
		return this.router;
	}
}
