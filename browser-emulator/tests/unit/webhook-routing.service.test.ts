import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../src/services/logger.service.js';
import { WebhookRoutingService } from '../../src/services/webhook-routing.service.ts';

const receiveMock = vi.fn();

vi.mock('livekit-server-sdk', () => ({
	WebhookReceiver: vi.fn().mockImplementation(function (
		this: { receive: typeof receiveMock },
		apiKey: string,
		apiSecret: string,
	) {
		this.apiKey = apiKey;
		this.apiSecret = apiSecret;
		this.receive = receiveMock;
	}),
}));

const loggerService = new LoggerService();

describe('WebhookRoutingService', () => {
	let service: WebhookRoutingService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new WebhookRoutingService(loggerService);
	});

	describe('dispatch', () => {
		it('calls the exact-identity handler when one is registered', () => {
			const handler = vi.fn();
			service.registerIdentity('alice', handler);

			service.dispatch('alice', 'participant_left', 'room-1');

			expect(handler).toHaveBeenCalledWith('participant_left', 'room-1');
		});

		it('does not call a handler for a different identity', () => {
			const handler = vi.fn();
			service.registerIdentity('alice', handler);

			service.dispatch('bob', 'participant_left', 'room-1');

			expect(handler).not.toHaveBeenCalled();
		});

		it('falls back to a prefix match for loadtest-mode identities', () => {
			const handler = vi.fn();
			service.registerPrefix('run-123', handler);

			service.dispatch('run-123_pub_0', 'track_unpublished', 'room-1');

			expect(handler).toHaveBeenCalledWith('track_unpublished', 'room-1');
		});

		it('does not match a prefix as a substring without the separator', () => {
			const handler = vi.fn();
			service.registerPrefix('run-123', handler);

			service.dispatch('run-1234_pub_0', 'track_unpublished', 'room-1');

			expect(handler).not.toHaveBeenCalled();
		});

		it('prefers an exact identity match over a prefix match', () => {
			const identityHandler = vi.fn();
			const prefixHandler = vi.fn();
			service.registerPrefix('run-123', prefixHandler);
			service.registerIdentity('run-123_pub_0', identityHandler);

			service.dispatch('run-123_pub_0', 'participant_left', 'room-1');

			expect(identityHandler).toHaveBeenCalled();
			expect(prefixHandler).not.toHaveBeenCalled();
		});

		it('does nothing when no identity or prefix matches (event belongs to another worker)', () => {
			expect(() =>
				service.dispatch('someone-else', 'participant_left', 'room-1'),
			).not.toThrow();
		});

		it('unregisterIdentity/unregisterPrefix stop future dispatches', () => {
			const identityHandler = vi.fn();
			const prefixHandler = vi.fn();
			service.registerIdentity('alice', identityHandler);
			service.registerPrefix('run-123', prefixHandler);

			service.unregisterIdentity('alice');
			service.unregisterPrefix('run-123');

			service.dispatch('alice', 'participant_left', 'room-1');
			service.dispatch('run-123_pub_0', 'participant_left', 'room-1');

			expect(identityHandler).not.toHaveBeenCalled();
			expect(prefixHandler).not.toHaveBeenCalled();
		});
	});

	describe('verifyAndParse', () => {
		it('returns undefined when no credentials have been cached yet', async () => {
			const result = await service.verifyAndParse('{}', 'auth-header');

			expect(result).toBeUndefined();
			expect(receiveMock).not.toHaveBeenCalled();
		});

		it('verifies the body once credentials are cached', async () => {
			const fakeEvent = { event: 'participant_left' };
			receiveMock.mockResolvedValue(fakeEvent);
			service.setCredentials('key', 'secret');

			const result = await service.verifyAndParse('{}', 'auth-header');

			expect(receiveMock).toHaveBeenCalledWith('{}', 'auth-header');
			expect(result).toBe(fakeEvent);
		});

		it('returns undefined when verification throws', async () => {
			receiveMock.mockRejectedValue(new Error('bad signature'));
			service.setCredentials('key', 'secret');

			const result = await service.verifyAndParse('{}', 'bad-header');

			expect(result).toBeUndefined();
		});

		it('does not rebuild the receiver when the same credentials are set again', async () => {
			const { WebhookReceiver } = await import('livekit-server-sdk');
			service.setCredentials('key', 'secret');
			service.setCredentials('key', 'secret');

			expect(WebhookReceiver).toHaveBeenCalledTimes(1);
		});

		it('ignores setCredentials calls with missing values', async () => {
			const { WebhookReceiver } = await import('livekit-server-sdk');
			service.setCredentials(undefined, undefined);

			const result = await service.verifyAndParse('{}', 'auth-header');

			expect(WebhookReceiver).not.toHaveBeenCalled();
			expect(result).toBeUndefined();
		});
	});
});
