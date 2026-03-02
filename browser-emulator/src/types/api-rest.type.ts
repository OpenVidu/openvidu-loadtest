import type { JsonValue } from './json.type.ts';
import { OpenViduRole, Resolution } from './openvidu.type.js';
import type { Request } from 'express';

export interface CreateUserBrowser {
	openviduUrl: string;
	openviduSecret?: string;
	token?: string;
	properties: UserJoinProperties;
}

export interface ElasticsearchCredentials {
	elasticSearchPassword: string;
	elasticSearchUserName: string;
	elasticSearchHost: string;
	elasticSearchIndex: string;
}

export type InitializePost = {
	browserVideo: BrowserVideo;
	qoeAnalysis?: QoeAnalysis;
	awsAccessKey?: string;
	awsSecretAccessKey?: string;
	s3BucketName?: string;
	s3Region?: string;
	s3Host?: string;
	s3HostAccessKey?: string;
	s3HostSecretAccessKey?: string;
} & (
	| ElasticsearchCredentials
	| Partial<Record<keyof ElasticsearchCredentials, never>>
);

export interface BrowserVideoCustom {
	videoType: 'custom';
	customVideo: CustomBrowserVideoConfig;
}

export interface BrowserVideoPreset {
	videoType: 'bunny' | 'interview' | 'game';
	videoInfo: BrowserVideoInfo;
}

export type BrowserVideo = BrowserVideoCustom | BrowserVideoPreset;

export interface BrowserVideoInfo {
	// TODO: This should probably use the Resolution enum
	width: number;
	height: number;
	fps: number;
}

export interface CustomBrowserVideoConfig {
	video: CustomBrowserVideo;
	audioUrl: string;
}

export type CustomBrowserVideo = BrowserVideoInfo & {
	url: string;
};

export interface QoeAnalysis {
	enabled: boolean;
	fragment_duration: number;
	padding_duration: number;
}

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

export interface UserJoinProperties {
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
	connectionId: string;
	streams: number;
	participants: number;
	workerCpuUsage: number;
	sessionId: string;
	userId: string;
}

export interface JSONStatsResponse {
	timestamp: string;
	user: string;
	session: string;
	webrtcStats: Record<string, JsonValue>;
}

export type JSONStreamsInfo = JSONUserInfo & {
	streams: number;
	worker_name: string;
	node_role: string;
};

export interface JSONUserInfo {
	'@timestamp': string;
	new_participant_id: string;
	new_participant_session: string;
}

interface ElasticsearchConfig {
	elasticsearch_hostname: string;
	elasticsearch_username: string;
	elasticsearch_password: string;
	index: string;
}

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

export interface JSONQoEInfo {
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
}

export interface BrowserEvent {
	participant: string;
	session: string;
	timestamp: Date;
	[key: string]: JsonValue;
}

export interface WebRTCStatsRequest extends Request {
	body: JSONStatsResponse;
}

export interface BrowserEventRequest extends Request {
	body: BrowserEvent;
}

export interface InitializePostRequest extends Request {
	body: InitializePost;
}

export interface CreateUserBrowserRequest extends Request {
	body: CreateUserBrowser;
}
