import type { OpenViduRole, Resolution } from './openvidu.type.ts';
import type { Request } from 'express';

export interface CreateUserBrowserRequest extends Request {
	body: CreateUserBrowser;
}

export interface CreateUserBrowser {
	openviduUrl: string;
	openviduSecret?: string;
	token?: string;
	properties: UserJoinProperties;
}

export interface UserJoinProperties {
	userId: string;
	sessionName: string;
	role: OpenViduRole;
	audio: boolean;
	video: boolean;
	resolution: Resolution;
	recordingOutputMode?: RecordingOutputMode;
	frameRate: number;
	browser: AvailableBrowsers;
	recording?: boolean;
	showVideoElements?: boolean;
	headless?: boolean;
	recordingMetadata?: string;
}

export const RecordingOutputMode = {
	COMPOSED: 'COMPOSED',
	INDIVIDUAL: 'INDIVIDUAL',
} as const;

export type RecordingOutputMode =
	(typeof RecordingOutputMode)[keyof typeof RecordingOutputMode];

export type AvailableBrowsers = 'chrome' | 'firefox';

export interface CreateUserBrowserResponse {
	connectionId: string;
	streams: number;
	participants: number;
	workerCpuUsage: number;
	sessionId: string;
	userId: string;
}
