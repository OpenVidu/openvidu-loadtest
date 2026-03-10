import type {
	CreateUserBrowser,
	UserJoinProperties,
} from '../create-user.type.ts';

export type OVCreateUserBrowser = CreateUserBrowser & {
	openviduSecret?: string;
	properties: OVUserJoinProperties;
};

export type OVUserJoinProperties = UserJoinProperties & {
	recordingOutputMode?: RecordingOutputMode;
};

export const RecordingOutputMode = {
	COMPOSED: 'COMPOSED',
	INDIVIDUAL: 'INDIVIDUAL',
} as const;

export type RecordingOutputMode =
	(typeof RecordingOutputMode)[keyof typeof RecordingOutputMode];
