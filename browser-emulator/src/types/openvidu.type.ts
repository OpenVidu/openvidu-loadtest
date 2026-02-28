export const OpenViduRole = {
	PUBLISHER: 'PUBLISHER',
	SUBSCRIBER: 'SUBSCRIBER',
} as const;

export type OpenViduRole = (typeof OpenViduRole)[keyof typeof OpenViduRole];

export const Resolution = {
	DEFAULT: '640x480',
	HIGH: '1280x720',
	FULLHIGH: '1920x1080',
} as const;

export type Resolution = (typeof Resolution)[keyof typeof Resolution];
