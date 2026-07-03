import * as express from 'express';
import type { Request, Response } from 'express';
import type { LoggerService } from '../services/logger.service.ts';
import type { WebhookRoutingService } from '../services/webhook-routing.service.ts';

/** Webhook event types that indicate a participant may have dropped out of a room. */
const HANDLED_EVENT_TYPES = new Set([
	'participant_left',
	'participant_connection_aborted',
	'track_unpublished',
]);

export class WebhookController {
	private readonly router: express.Router;
	private readonly webhookRoutingService: WebhookRoutingService;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	constructor(
		webhookRoutingService: WebhookRoutingService,
		loggerService: LoggerService,
	) {
		this.webhookRoutingService = webhookRoutingService;
		this.logger = loggerService.getLogger('WebhookController');
		this.router = express.Router({ strict: true });
		this.setupRoutes();
	}

	private setupRoutes(): void {
		this.router.post(
			'/livekit',
			express.raw({ type: '*/*', limit: '5mb' }),
			this.handleLiveKitWebhook.bind(this),
		);
	}

	private async handleLiveKitWebhook(
		req: Request,
		res: Response,
	): Promise<void> {
		// Always ack with 200: LiveKit retries on non-2xx, and events that don't
		// verify or don't belong to this worker are expected, not errors.
		res.status(200).send();

		try {
			const rawBody = Buffer.isBuffer(req.body)
				? req.body.toString('utf-8')
				: String(req.body ?? '');

			const event = await this.webhookRoutingService.verifyAndParse(
				rawBody,
				req.header('Authorization'),
			);
			if (!event || !HANDLED_EVENT_TYPES.has(event.event)) {
				return;
			}

			const identity = event.participant?.identity;
			const room = event.room?.name;
			if (!identity || !room) {
				return;
			}

			this.webhookRoutingService.dispatch(identity, event.event, room);
		} catch (error) {
			this.logger.error(
				{ error: String(error) },
				'Error handling LiveKit webhook event',
			);
		}
	}

	public getRouter(): express.Router {
		return this.router;
	}
}
