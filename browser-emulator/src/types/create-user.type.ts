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
	/**
	 * Preferred video codec for published tracks, applied as the LiveKit client's
	 * preferred publish codec. Only takes effect for real browsers (chrome/firefox)
	 * against a LiveKit platform; ignored otherwise.
	 */
	videoCodec?: VideoCodec;
	recording?: boolean;
	showVideoElements?: boolean;
	headless?: boolean;
	recordingMetadata?: string;
	mediaRecorders?: boolean;
	/**
	 * Debug-only: for PUBLISHER participants, disables auto-subscription so the
	 * publisher doesn't also subscribe to other participants' tracks. For
	 * custom-emulated publishers it omits --auto-subscribe from the `lk room join`
	 * command; for real-browser publishers it sets autoSubscribe=false in the
	 * LiveKit room connect options. Has no effect on SUBSCRIBER participants.
	 */
	disableAutoSubscribeForPublishers?: boolean;
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

export const VideoCodec = {
	H264: 'h264',
	VP8: 'vp8',
	VP9: 'vp9',
	AV1: 'av1',
} as const;

export type VideoCodec = (typeof VideoCodec)[keyof typeof VideoCodec];

export type AvailableBrowsers = 'chrome' | 'firefox' | 'custom-emulated';

export interface CreateUserBrowserResponse {
	connectionId: string;
	streams: number;
	participants: number;
	workerCpuUsage: number;
	sessionId: string;
	userId: string;
}
