import { OpenViduRole } from './openvidu.type';

export interface LoadTestPostRequest {
	openviduUrl: string,
 	openviduSecret: string,
    browserMode: BrowserMode,
    properties: TestProperties
}


export enum BrowserMode {
	EMULATE = 'emulate',
	REAL = 'real'
}

export interface TestProperties {
	userId: string,
	sessionName: string,
	role: OpenViduRole,
	audio: boolean,
	video: boolean,
	resolution?: string,
	token?: string,

	// Only with BrowserMode=REAL
	recording?: boolean
	showVideoElements?: boolean
}

export interface LoadTestPostResponse {
	connectionId: string,
 	workerCpuUsage: number
}
