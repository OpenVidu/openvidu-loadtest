import { OpenViduRole } from './openvidu.type';

export interface LoadTestPostRequest {
	openviduUrl: string,
	openviduSecret: string,
	token?: string,
    browserMode: BrowserMode,
    properties: TestProperties
}


export enum BrowserMode {
	EMULATE = 'emulate',
	REAL = 'real'
}

export enum RecordingMode {
	ALWAYS = 'ALWAYS',
	// MANUAL = 'MANUAL'
}

export enum RecordingOutputMode {
	COMPOSED = 'COMPOSED',
	INDIVIDUAL = 'INDIVIDUAL'
}

export enum RecordingLayoutMode {
	BEST_FIT = 'BEST_FIT'
}


export interface TestProperties {
	userId: string,
	sessionName: string,
	role: OpenViduRole,
	audio: boolean,
	video: boolean,
	resolution?: string,
	recordingOutputMode?: RecordingOutputMode,
	frameRate: number,

	// Only with BrowserMode=REAL
	recording?: boolean
	showVideoElements?: boolean,
	headless?: boolean
}

export interface LoadTestPostResponse {
	connectionId: string,
 	workerCpuUsage: number
}
