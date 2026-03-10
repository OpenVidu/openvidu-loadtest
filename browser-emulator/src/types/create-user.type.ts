import type { Request } from 'express';

export interface CreateUserBrowserRequest extends Request {
	body: CreateUserBrowser;
}

export interface CreateUserBrowser {
	openviduUrl: string;
	token?: string;
	properties: UserJoinProperties;
}

export interface UserJoinProperties {
	userId: string;
	sessionName: string;
	role: Role;
	audio: boolean;
	video: boolean;
	resolution: Resolution;
	frameRate: number;
	browser: AvailableBrowsers;
	recording?: boolean;
	showVideoElements?: boolean;
	headless?: boolean;
	recordingMetadata?: string;
	mediaRecorders?: boolean;
}
export const Role = {
	PUBLISHER: 'PUBLISHER',
	SUBSCRIBER: 'SUBSCRIBER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const Resolution = {
	DEFAULT: '640x480',
	HIGH: '1280x720',
	FULLHIGH: '1920x1080',
} as const;

export type Resolution = (typeof Resolution)[keyof typeof Resolution];

export type AvailableBrowsers = 'chrome' | 'firefox';

export interface CreateUserBrowserResponse {
	connectionId: string;
	streams: number;
	participants: number;
	workerCpuUsage: number;
	sessionId: string;
	userId: string;
}
