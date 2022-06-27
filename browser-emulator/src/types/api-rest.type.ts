import { OpenViduRole, Resolution } from './openvidu.type';

export interface LoadTestPostRequest {

	openviduUrl: string,
	openviduSecret: string,
	token?: string,
    browserMode: BrowserMode,
    properties: TestProperties
}

export interface InitializePostRequest {
	qoeAnalysis?: QoeAnalysisRequest;
    elasticSearchPassword: string;
	elasticSearchUserName: string;
	elasticSearchHost: string;
    elasticSearchIndex?: string;
	awsAccessKey?: string;
	awsSecretAccessKey?: string;
	s3BucketName?: string;
}

export interface QoeAnalysisRequest {
    enabled: boolean;
    fragment_duration: number;
    padding_duration: number;
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

export interface JSONStreamsInfo extends JSONUserInfo {
	streams: number,
	worker_name: string
    node_role: string,
}

export interface JSONUserInfo {
    '@timestamp': string,
    new_participant_id: string,
    new_participant_session: string
}

export interface JSONQoeProcessing {
    index: string,
    padding_duration: number,
    fragment_duration: number,
    presenter_video_file_location: string,
    presenter_audio_file_location: string,
    width: number | string,
    height: number | string,
    framerate: number,
    timestamps?: JSONUserInfo[]
}

export interface JSONQoEInfo {
    '@timestamp': string,
    session: string,
    userFrom: string,
    userTo: string,
    cutIndex: number,
    vmaf: number,
    vifp: number,
    ssim: number,
    psnr: number,
    msssim: number,
    psnrhvs: number,
    psnrhvsm: number,
    pesq: number,
    visqol: number
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