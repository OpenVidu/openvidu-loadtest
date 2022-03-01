import { OpenViduRole, Resolution } from './openvidu.type';

export interface LoadTestPostRequest {

	openviduUrl: string,
	openviduSecret: string,
	token?: string,
    browserMode: BrowserMode,
    properties: TestProperties
}

export interface InitializePostRequest {
	qoeAnalysis?: string;
    elasticSearchPassword: string;
	elasticSearchUserName: string;
	elasticSearchHost: string;
    elasticSearchIndex?: string;
	awsAccessKey?: string;
	awsSecretAccessKey?: string;
	s3BucketName?: string;
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
	userId: string;
	sessionName: string;
	role: OpenViduRole;
	audio: boolean;
	video: boolean;
	resolution: Resolution;
	recordingOutputMode?: RecordingOutputMode;
	frameRate: number;
	// Only with BrowserMode=REAL;
	recording?: boolean;
	showVideoElements?: boolean;
	headless?: boolean;
	recordingMetadata?: string;
}

export interface LoadTestPostResponse {
	connectionId: string,
	streams: number,
	participants: number,
 	workerCpuUsage: number,
    sessionId: string,
    userId: string
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

export interface JSONStreamsInfo {
	'@timestamp': string,
	streams: number,
	worker_name: string
    node_role: string

}

interface IWebrtcStats {
    inbound?: {
        audio: {
            bytesReceived: number,
            packetsReceived: number,
            packetsLost: number,
            jitter: number
        } | {},
        video: {
            bytesReceived: number,
            packetsReceived: number,
            packetsLost: number,
            jitter?: number, // Firefox
            jitterBufferDelay?: number, // Chrome
            framesDecoded: number,
            firCount: number,
            nackCount: number,
            pliCount: number,
            frameHeight?: number, // Chrome
            frameWidth?: number, // Chrome
            framesDropped?: number, // Chrome
            framesReceived?: number // Chrome
        } | {}
    },
    outbound?: {
        audio: {
            bytesSent: number,
            packetsSent: number,
        } | {},
        video: {
            bytesSent: number,
            packetsSent: number,
            firCount: number,
            framesEncoded: number,
            nackCount: number,
            pliCount: number,
            qpSum: number,
            frameHeight?: number, // Chrome
            frameWidth?: number, // Chrome
            framesSent?: number // Chrome
        } | {}
    },
    candidatepair?: {
        currentRoundTripTime?: number // Chrome
        availableOutgoingBitrate?: number //Chrome
        // availableIncomingBitrate?: number // No support for any browsers (https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidatePairStats/availableIncomingBitrate)
    }
};