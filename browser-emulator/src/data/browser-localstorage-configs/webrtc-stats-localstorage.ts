import type { WebrtcStatsConfig } from '../../types/storage-config.type.ts';
import { BaseLocalStorageConfig } from './base-localstorage-config.ts';

export class WebrtcStatsLocalStorage extends BaseLocalStorageConfig {
	private readonly WEBRTC_INTERVAL: number = 1;
	private readonly SEND_INTERVAL: number = 2;

	constructor(hostname: string) {
		super('webrtc-stats-info', '/webrtcStats', hostname);
	}

	protected buildConfig(): WebrtcStatsConfig {
		return {
			interval: this.WEBRTC_INTERVAL,
			sendInterval: this.SEND_INTERVAL,
			httpEndpoint: this.getEndpointUrl(),
		};
	}
}
