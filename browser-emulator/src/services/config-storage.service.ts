import { OpenViduEventsConfig, QoeRecordingsConfig, WebrtcStatsConfig } from '../types/storage-config.type';

export class WebrtcStatsService {
	private readonly ITEM_NAME: string = 'webrtc-stats-config';
	private readonly WEBRTC_INTERVAL: number = 3;

	public getConfig(): string {
		const statsConfig: WebrtcStatsConfig = {
			interval: this.WEBRTC_INTERVAL,
			httpEndpoint: `https://${process.env.LOCATION_HOSTNAME}/webrtcStats`,
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
			httpEndpoint: `https://${process.env.LOCATION_HOSTNAME}/events`,
		};
		return JSON.stringify(statsConfig);
	}

	public getItemName(): string {
		return this.ITEM_NAME;
	}
}

export class QoERecordingsService {
	private readonly ITEM_NAME: string = 'ov-qoe-config';

	public getConfig(): string {
		const statsConfig: QoeRecordingsConfig = {
			httpEndpoint: `https://${process.env.LOCATION_HOSTNAME}/qoe/qoeRecordings`,
		};
		return JSON.stringify(statsConfig);
	}

	public getItemName(): string {
		return this.ITEM_NAME;
	}
}
