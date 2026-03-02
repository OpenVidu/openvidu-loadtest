import type { OpenViduEventsConfig } from '../../types/storage-config.type.ts';
import { BaseLocalStorageConfig } from './base-localstorage-config.ts';

export class OpenViduEventsLocalStorage extends BaseLocalStorageConfig {
	constructor(hostname: string) {
		super('ov-events-config', '/events', hostname);
	}

	protected buildConfig(): OpenViduEventsConfig {
		return {
			httpEndpoint: this.getEndpointUrl(),
		};
	}
}
