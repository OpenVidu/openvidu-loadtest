

export enum OpenViduRole {
	PUBLISHER = 'PUBLISHER',
	SUBSCRIBER = 'SUBSCRIBER'
}

export interface PublisherProperties {
	role: OpenViduRole,
	audio: boolean,
	video: boolean
}
