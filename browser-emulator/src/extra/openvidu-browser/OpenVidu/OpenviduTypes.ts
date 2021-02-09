

export enum OpenViduRole {
	PUBLISHER = 'PUBLISHER',
	SUBSCRIBER = 'SUBSCRIBER'
}

export enum BrowserMode {
	EMULATE = 'emulate',
	REAL = 'real'
}

export interface PublisherProperties {
	userId: string,
	sessionName: string,
	token?: string,
	role: OpenViduRole,
	audio: boolean,
	video: boolean,
	recording: boolean
}
