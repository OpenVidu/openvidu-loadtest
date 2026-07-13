import { beforeEach, describe, expect, it, vi } from 'vitest';
import LiveKitComModule from '../../src/com-modules/options/livekit.js';
import { LoggerService } from '../../src/services/logger.service.js';
import {
	Resolution,
	Role,
	type UserJoinProperties,
} from '../../src/types/create-user.type.js';
import type { LKCreateUserBrowser } from '../../src/types/com-modules/livekit.js';

const loggerService = new LoggerService();

const mockConfigService = {
	getBrowserEmulatorHostForBrowsers: vi.fn().mockReturnValue('localhost'),
	isHttpsDisabled: vi.fn().mockReturnValue(true),
	getServerPort: vi.fn().mockReturnValue(5000),
};

function buildRequest(
	overrides: Partial<UserJoinProperties> = {},
): LKCreateUserBrowser {
	const properties: UserJoinProperties = {
		userId: 'user1',
		sessionName: 'session1',
		role: Role.PUBLISHER,
		audio: true,
		video: true,
		resolution: Resolution.DEFAULT,
		frameRate: 30,
		browser: 'chrome',
		showVideoElements: false,
		...overrides,
	};
	return {
		openviduUrl: 'https://openvidu.example.com',
		token: 'test-token',
		properties,
		livekitApiKey: 'devkey',
		livekitApiSecret: 'secret',
	};
}

describe('LiveKitComModule.generateWebappUrl', () => {
	let comModule: LiveKitComModule;

	beforeEach(() => {
		comModule = new LiveKitComModule(
			mockConfigService as never,
			loggerService,
		);
	});

	it('sets disableAutoSubscribeForPublishers=true when the flag is enabled', () => {
		const url = comModule.generateWebappUrl(
			buildRequest({ disableAutoSubscribeForPublishers: true }),
		);
		expect(url).toContain('disableAutoSubscribeForPublishers=true');
	});

	it('sets disableAutoSubscribeForPublishers=false when the flag is omitted', () => {
		const url = comModule.generateWebappUrl(buildRequest());
		expect(url).toContain('disableAutoSubscribeForPublishers=false');
	});
});
