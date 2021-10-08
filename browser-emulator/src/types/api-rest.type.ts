import { OpenViduRole } from './openvidu.type';

export interface LoadTestPostRequest {

	openviduUrl: string,
	openviduSecret: string,
    elasticSearchPassword?: string;
	elasticSearchUserName?: string;
	elasticSearchHost?: string;
	token?: string,
    browserMode: BrowserMode,
    properties: TestProperties
}


export enum BrowserMode {
	EMULATE = 'EMULATE',
	REAL = 'REAL'
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

export interface JSONStatsResponse {
    '@timestamp': string,
    participant_id: string,
    session_id: string,
    platform: string,
    platform_description: string,
    stream: string,
    webrtc_stats: IWebrtcStats
}

interface IWebrtcStats {
    inbound: {
        audio: {
            bytesReceived: number,
            packetsReceived: number,
            packetsLost: number
            jitter: number,
            delayMs: number
        } | {},
        video: {
            bytesReceived: number,
            packetsReceived: number,
            packetsLost: number,
            framesDecoded: number,
            nackCount: number
        } | {}
    } | {},
    outbound: {
        audio: {
            bytesSent: number,
            packetsSent: number,
        } | {},
        video: {
            bytesSent: number,
            packetsSent: number,
            framesEncoded: number,
            nackCount: number
        } | {}
    } | {}
};