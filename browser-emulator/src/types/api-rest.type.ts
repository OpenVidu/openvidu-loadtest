import { OpenViduRole, Resolution } from './openvidu.type';

export interface LoadTestPostRequest {

	openviduUrl: string,
	openviduSecret?: string,
	token?: string,
    properties: TestProperties
}

export interface InitializePostRequest {
	qoeAnalysis?: QoeAnalysisRequest;
    // Only needed with browser type REAL
    browserVideo?: BrowserVideoRequest;
    elasticSearchPassword: string;
	elasticSearchUserName: string;
	elasticSearchHost: string;
    elasticSearchIndex?: string;
	awsAccessKey?: string;
	awsSecretAccessKey?: string;
	s3BucketName?: string;
    minioHost?: string;
    minioAccessKey?: string;
    minioSecretKey?: string;
    minioPort?: number;
    minioBucket?: string;
}

export interface BrowserVideoRequest {
    videoType: "bunny" | "interview" | "game" | "custom";
    // needed if not using custom video
    videoInfo?: BrowserVideoInfo;
    customVideo? : CustomBrowserVideoRequest;
}

export interface BrowserVideoInfo {
    width: number;
    height: number;
    fps: number;
}

export interface CustomBrowserVideoRequest {
    video: CustomBrowserVideo;
    audioUrl: string;
}

export interface CustomBrowserVideo extends BrowserVideoInfo {
    url: string;
}

export interface QoeAnalysisRequest {
    enabled: boolean;
    fragment_duration: number;
    padding_duration: number;
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
    timestamp: string,
    user: string,
    session: string,
    webrtcStats: any
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

export interface JSONQoeProcessingELK extends JSONQoeProcessing {
    elasticsearch_hostname: string,
    elasticsearch_username: string,
    elasticsearch_password: string,
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