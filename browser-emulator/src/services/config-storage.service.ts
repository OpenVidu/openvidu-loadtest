import { OpenViduEventsConfig, WebrtcStatsConfig } from '../types/storage-config.type';

export class WebrtcStatsService {

	private readonly ITEM_NAME: string = 'webrtc-stats-config';
	private readonly WEBRTC_INTERVAL: number = 5;

	public getConfig(): string {
		const statsConfig: WebrtcStatsConfig = {
			interval: this.WEBRTC_INTERVAL,
			httpEndpoint: `https://${process.env.LOCATION_HOSTNAME}/webrtcStats`
		};
		return JSON.stringify(statsConfig);
	}

	public getItemName(): string {
		return this.ITEM_NAME;
	}
}

export class OpenViduEventsService {

	private readonly ITEM_NAME: string = 'ov-events-config';

	public getConfig(): string {
		const statsConfig: OpenViduEventsConfig = {
			httpEndpoint: `https://${process.env.LOCATION_HOSTNAME}/events`
		};
		return JSON.stringify(statsConfig);
	}

	public getItemName(): string {
		return this.ITEM_NAME;
	}
}