import { WebrtcStatsConfig } from '../types/stats-config.type';


export class WebrtcStatsStorage {

	private readonly ITEM_NAME: string = 'webrtc-stats-config';
	private statsConfig: WebrtcStatsConfig = {
		interval: 1,
		httpEndpoint: `https://${process.env.LOCATION_HOSTNAME}/openvidu-browser/webrtcStats`
	};

	public getConfig(): string {
		return JSON.stringify(this.statsConfig);
	}

	public getItemName(): string {
		return this.ITEM_NAME;
	}


}