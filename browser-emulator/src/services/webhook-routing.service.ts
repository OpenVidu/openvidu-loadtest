import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';
import type { LoggerService } from './logger.service.ts';

export type WebhookEventHandler = (eventType: string, room: string) => void;

/**
 * LiveKit is configured to broadcast every webhook event to every worker's
 * `webhook.urls` entry, since a worker only finds out which room/participant
 * an event belongs to after parsing it. This service lets each worker
 * register the identities/identity-prefixes it owns so it can recognize and
 * act only on events for its own participants, ignoring the rest (which
 * belong to other workers).
 */
export class WebhookRoutingService {
	private readonly identityHandlers = new Map<string, WebhookEventHandler>();
	private readonly prefixHandlers = new Map<string, WebhookEventHandler>();

	private apiKey: string | undefined;
	private apiSecret: string | undefined;
	private webhookReceiver: WebhookReceiver | undefined;

	private readonly logger: ReturnType<LoggerService['getLogger']>;

	constructor(loggerService: LoggerService) {
		this.logger = loggerService.getLogger('WebhookRoutingService');
	}

	/**
	 * Caches the LiveKit credentials used to verify incoming webhooks. There is
	 * no global LiveKit API key/secret for this worker process — credentials
	 * arrive per participant/run creation request — so the most recently seen
	 * pair is used, which in practice is stable for the whole test run.
	 */
	setCredentials(apiKey?: string, apiSecret?: string): void {
		if (!apiKey || !apiSecret) {
			return;
		}
		if (apiKey === this.apiKey && apiSecret === this.apiSecret) {
			return;
		}
		this.apiKey = apiKey;
		this.apiSecret = apiSecret;
		this.webhookReceiver = new WebhookReceiver(apiKey, apiSecret);
	}

	registerIdentity(identity: string, handler: WebhookEventHandler): void {
		this.identityHandlers.set(identity, handler);
	}

	unregisterIdentity(identity: string): void {
		this.identityHandlers.delete(identity);
	}

	registerPrefix(prefix: string, handler: WebhookEventHandler): void {
		this.prefixHandlers.set(prefix, handler);
	}

	unregisterPrefix(prefix: string): void {
		this.prefixHandlers.delete(prefix);
	}

	/**
	 * Routes an incoming webhook event to the local handler that owns
	 * `identity`, if any. Most invocations are expected to match nothing, since
	 * the same webhook is broadcast to every worker.
	 */
	dispatch(identity: string, eventType: string, room: string): void {
		const identityHandler = this.identityHandlers.get(identity);
		if (identityHandler) {
			identityHandler(eventType, room);
			return;
		}

		for (const [prefix, handler] of this.prefixHandlers) {
			if (identity.startsWith(`${prefix}_`)) {
				handler(eventType, room);
				return;
			}
		}

		this.logger.debug(
			{ identity, eventType, room },
			'No local owner for webhook event, ignoring',
		);
	}

	/**
	 * Verifies and parses an incoming webhook body. Returns undefined (instead
	 * of throwing) when verification can't be attempted yet or fails, so the
	 * caller can simply ack the request without processing it.
	 */
	async verifyAndParse(
		rawBody: string,
		authHeader?: string,
	): Promise<WebhookEvent | undefined> {
		if (!this.webhookReceiver) {
			this.logger.warn(
				'Received webhook before any LiveKit credentials were cached, ignoring',
			);
			return undefined;
		}

		try {
			return await this.webhookReceiver.receive(rawBody, authHeader);
		} catch (error) {
			this.logger.warn(
				{ error: String(error) },
				'Failed to verify/parse LiveKit webhook event',
			);
			return undefined;
		}
	}
}
