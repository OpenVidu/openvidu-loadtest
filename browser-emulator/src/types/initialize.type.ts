import type { Request } from 'express';

export interface InitializePostRequest extends Request {
	body: InitializePost;
}

export type InitializePost = {
	browserVideo: BrowserVideo;
	vnc?: boolean;
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

export type BrowserVideo = BrowserVideoCustom | BrowserVideoPreset;

export interface BrowserVideoCustom {
	videoType: 'custom';
	customVideo: CustomBrowserVideoConfig;
}

export interface CustomBrowserVideoConfig {
	videoUrl: string;
	audioUrl: string;
}

export interface BrowserVideoPreset {
	videoType: 'bunny' | 'interview' | 'game';
	videoInfo: BrowserVideoInfo;
}

export interface BrowserVideoInfo {
	// TODO: This should probably use the Resolution enum
	width: number;
	height: number;
	fps: number;
}

export interface QoeAnalysis {
	enabled: boolean;
	fragment_duration: number;
	padding_duration: number;
}

export interface ElasticsearchCredentials {
	elasticSearchPassword: string;
	elasticSearchUserName: string;
	elasticSearchHost: string;
	elasticSearchIndex: string;
}
