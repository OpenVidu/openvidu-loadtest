export interface WebrtcStatsConfig {
	interval: number;
	sendInterval: number;
	httpEndpoint: string;
}

export interface OpenViduEventsConfig {
	httpEndpoint: string;
}

export interface StorageNameObject {
	webrtcStorageName: string;
	ovEventStorageName: string;
	qoeStorageName: string;
	errorStorageName: string;
}

export interface StorageValueObject {
	webrtcStorageValue: string;
	ovEventStorageValue: string;
	qoeStorageValue: string;
	errorStorageValue: string;
}

export interface QoeRecordingsConfig {
	httpEndpoint: string;
}

export interface EventErrorConfig {
	httpEndpoint: string;
}
