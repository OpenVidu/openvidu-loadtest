import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../src/services/logger.service.js';
import { WebhookController } from '../../src/controllers/webhook.controller.ts';

function buildRequest(body: Buffer, authHeader?: string) {
	return {
		body,
		header: (name: string) =>
			name === 'Authorization' ? authHeader : undefined,
	} as never;
}

function buildResponse() {
	return {
		status: vi.fn().mockReturnThis(),
		send: vi.fn().mockReturnThis(),
	} as never;
}

const loggerService = new LoggerService();

describe('WebhookController', () => {
	let webhookRoutingService: {
		verifyAndParse: ReturnType<typeof vi.fn>;
		dispatch: ReturnType<typeof vi.fn>;
	};
	let controller: WebhookController;

	beforeEach(() => {
		webhookRoutingService = {
			verifyAndParse: vi.fn(),
			dispatch: vi.fn(),
		};
		controller = new WebhookController(
			webhookRoutingService as never,
			loggerService,
		);
	});

	function getHandler() {
		const layer = (controller.getRouter() as never as { stack: unknown[] })
			.stack[0] as {
			route: { stack: { handle: (...args: unknown[]) => unknown }[] };
		};
		return layer.route.stack[layer.route.stack.length - 1].handle as (
			req: unknown,
			res: unknown,
		) => Promise<void>;
	}

	it('always responds 200 even for unrecognized events', async () => {
		webhookRoutingService.verifyAndParse.mockResolvedValue({
			event: 'room_started',
		});
		const req = buildRequest(Buffer.from('{}'), 'auth');
		const res = buildResponse() as { status: ReturnType<typeof vi.fn> };

		await getHandler()(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(webhookRoutingService.dispatch).not.toHaveBeenCalled();
	});

	it('dispatches handled event types with identity and room', async () => {
		webhookRoutingService.verifyAndParse.mockResolvedValue({
			event: 'participant_left',
			participant: { identity: 'alice' },
			room: { name: 'room-1' },
		});
		const req = buildRequest(Buffer.from('{}'), 'auth');
		const res = buildResponse();

		await getHandler()(req, res);

		expect(webhookRoutingService.dispatch).toHaveBeenCalledWith(
			'alice',
			'participant_left',
			'room-1',
		);
	});

	it('does not dispatch when verification fails', async () => {
		webhookRoutingService.verifyAndParse.mockResolvedValue(undefined);
		const req = buildRequest(Buffer.from('{}'), 'bad-auth');
		const res = buildResponse();

		await getHandler()(req, res);

		expect(webhookRoutingService.dispatch).not.toHaveBeenCalled();
	});

	it('does not dispatch when identity or room are missing', async () => {
		webhookRoutingService.verifyAndParse.mockResolvedValue({
			event: 'track_unpublished',
		});
		const req = buildRequest(Buffer.from('{}'));
		const res = buildResponse();

		await getHandler()(req, res);

		expect(webhookRoutingService.dispatch).not.toHaveBeenCalled();
	});
});
