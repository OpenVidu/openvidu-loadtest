import { OpenViduRole, Resolution } from './openvidu.type.js';

export type LoadTestPostRequest = {
	openviduUrl: string;
	openviduSecret?: string;
	token?: string;
	properties: TestProperties;
};

type ElasticsearchCredentials = {
	elasticSearchPassword: string;
	elasticSearchUserName: string;
	elasticSearchHost: string;
	elasticSearchIndex: string;
};

// TODO: remove minio properties and rename aws properties to be more generic, as they can be used for any S3 compatible service, not only AWS S3
export type InitializePostRequest = {
	qoeAnalysis?: QoeAnalysisRequest;
	browserVideo: BrowserVideoRequest;
	awsAccessKey?: string;
	awsSecretAccessKey?: string;
	s3BucketName?: string;
	s3Host?: string;
	minioHost?: string;
	minioAccessKey?: string;
	minioSecretKey?: string;
	minioPort?: number;
	minioBucket?: string;
} & (
	| ElasticsearchCredentials
	| Partial<Record<keyof ElasticsearchCredentials, never>>
);

export type BrowserVideoRequestCustom = {
	videoType: 'custom';
	customVideo: CustomBrowserVideoRequest;
};

export type BrowserVideoRequestPreset = {
	videoType: 'bunny' | 'interview' | 'game';
	videoInfo: BrowserVideoInfo;
};

export type BrowserVideoRequest =
	| BrowserVideoRequestCustom
	| BrowserVideoRequestPreset;

export type BrowserVideoInfo = {
	width: number;
	height: number;
	fps: number;
};

export type CustomBrowserVideoRequest = {
	video: CustomBrowserVideo;
	audioUrl: string;
};

export type CustomBrowserVideo = BrowserVideoInfo & {
	url: string;
};

export type QoeAnalysisRequest = {
	enabled: boolean;
	fragment_duration: number;
	padding_duration: number;
};

export const RecordingMode = {
	ALWAYS: 'ALWAYS',
	// MANUAL: 'MANUAL'
} as const;

export type RecordingMode = (typeof RecordingMode)[keyof typeof RecordingMode];

export const RecordingOutputMode = {
	COMPOSED: 'COMPOSED',
	INDIVIDUAL: 'INDIVIDUAL',
} as const;

export type RecordingOutputMode =
	(typeof RecordingOutputMode)[keyof typeof RecordingOutputMode];

export const RecordingLayoutMode = {
	BEST_FIT: 'BEST_FIT',
} as const;

export type RecordingLayoutMode =
	(typeof RecordingLayoutMode)[keyof typeof RecordingLayoutMode];

export type TestProperties = {
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
};

export type LoadTestPostResponse = {
	connectionId: string;
	streams: number;
	participants: number;
	workerCpuUsage: number;
	sessionId: string;
	userId: string;
};

export type JSONStatsResponse = {
	timestamp: string;
	user: string;
	session: string;
	webrtcStats: any;
};

export type JSONStreamsInfo = JSONUserInfo & {
	streams: number;
	worker_name: string;
	node_role: string;
};

export type JSONUserInfo = {
	'@timestamp': string;
	new_participant_id: string;
	new_participant_session: string;
};

type ElasticsearchConfig = {
	elasticsearch_hostname: string;
	elasticsearch_username: string;
	elasticsearch_password: string;
	index: string;
};

export type JSONQoeProcessing = {
	padding_duration: number;
	fragment_duration: number;
	presenter_video_file_location: string;
	presenter_audio_file_location: string;
	width: number | string;
	height: number | string;
	framerate: number;
	timestamps?: JSONUserInfo[];
} & (ElasticsearchConfig | Partial<Record<keyof ElasticsearchConfig, never>>);

export type JSONQoEInfo = {
	'@timestamp': string;
	session: string;
	userFrom: string;
	userTo: string;
	cutIndex: number;
	vmaf: number;
	vifp: number;
	ssim: number;
	psnr: number;
	msssim: number;
	psnrhvs: number;
	psnrhvsm: number;
	pesq: number;
	visqol: number;
};
