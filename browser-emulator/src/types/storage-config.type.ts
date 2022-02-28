export interface WebrtcStatsConfig {
    interval: number,
    httpEndpoint: string
}

export interface OpenViduEventsConfig {
    httpEndpoint: string
}

export interface StorageNameObject {
    webrtcStorageName: string,
    ovEventStorageName: string
}

export interface StorageValueObject {
    webrtcStorageValue: string,
    ovEventStorageValue: string
}

export interface QoeRecordingsConfig {
    httpEndpoint: string
}