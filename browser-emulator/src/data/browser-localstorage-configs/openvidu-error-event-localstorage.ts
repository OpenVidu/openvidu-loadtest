import type { EventErrorConfig } from '../../types/storage-config.type.ts';
import { BaseLocalStorageConfig } from './base-localstorage-config.ts';

export class ErrorEventLocalStorage extends BaseLocalStorageConfig {
	constructor(hostname: string) {
		super('ov-errorlog-config', '/events/errors', hostname);
	}

	protected buildConfig(): EventErrorConfig {
		return {
			httpEndpoint: this.getEndpointUrl(),
		};
	}
}
