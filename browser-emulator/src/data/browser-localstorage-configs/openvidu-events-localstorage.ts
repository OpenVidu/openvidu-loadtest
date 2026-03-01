import type { OpenViduEventsConfig } from '../../types/storage-config.type.ts';
import { BaseLocalStorageConfig } from './base-localstorage-config.ts';

export class OpenViduEventsLocalStorage extends BaseLocalStorageConfig {
	constructor() {
		super('ov-events-config', '/events');
	}

	protected buildConfig(): OpenViduEventsConfig {
		return {
			httpEndpoint: this.getEndpointUrl(this.endpoint),
		};
	}
}
