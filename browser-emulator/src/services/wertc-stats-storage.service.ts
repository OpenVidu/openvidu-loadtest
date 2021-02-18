import { WebrtcStatsConfig } from '../types/stats-config.type';

export class WebrtcStatsService {

	private readonly ITEM_NAME: string = 'webrtc-stats-config';
	private readonly WEBRTC_INTERVAL: number = 1;

	public getConfig(): string {
		const statsConfig: WebrtcStatsConfig ={
			interval: this.WEBRTC_INTERVAL,
			httpEndpoint: `https://${process.env.LOCATION_HOSTNAME}/webrtcStats`
		};
		return JSON.stringify(statsConfig);
	}

	public getItemName(): string {
		return this.ITEM_NAME;
	}
}