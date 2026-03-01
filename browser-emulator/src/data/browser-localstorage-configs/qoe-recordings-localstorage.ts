import type { QoeRecordingsConfig } from '../../types/storage-config.type.ts';
import { BaseLocalStorageConfig } from './base-localstorage-config.ts';

export class QoERecordingsLocalStorage extends BaseLocalStorageConfig {
	constructor() {
		super('ov-qoe-config', '/qoe/qoeRecordings');
	}

	protected buildConfig(): QoeRecordingsConfig {
		return {
			httpEndpoint: this.getEndpointUrl(this.endpoint),
		};
	}
}
