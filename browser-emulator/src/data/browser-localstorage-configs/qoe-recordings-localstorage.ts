import type { QoeRecordingsConfig } from '../../types/storage-config.type.ts';
import { BaseLocalStorageConfig } from './base-localstorage-config.ts';

export class QoERecordingsLocalStorage extends BaseLocalStorageConfig {
	constructor(hostname: string) {
		super('ov-qoe-config', '/qoe/qoeRecordings', hostname);
	}

	protected buildConfig(): QoeRecordingsConfig {
		return {
			httpEndpoint: this.getEndpointUrl(),
		};
	}
}
