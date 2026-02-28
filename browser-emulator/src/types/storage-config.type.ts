export type WebrtcStatsConfig = {
	interval: number;
	sendInterval: number;
	httpEndpoint: string;
};

export type OpenViduEventsConfig = {
	httpEndpoint: string;
};

export type StorageNameObject = {
	webrtcStorageName: string;
	ovEventStorageName: string;
};

export type StorageValueObject = {
	webrtcStorageValue: string;
	ovEventStorageValue: string;
};

export type QoeRecordingsConfig = {
	httpEndpoint: string;
};

export type EventErrorConfig = {
	httpEndpoint: string;
};
