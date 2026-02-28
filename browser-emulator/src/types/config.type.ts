export const ApplicationMode = {
	PROD: 'PRODUCTION',
	DEV: 'DEVELOPMENT',
} as const;

export type ApplicationMode =
	(typeof ApplicationMode)[keyof typeof ApplicationMode];
