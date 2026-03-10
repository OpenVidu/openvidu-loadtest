import type { CreateUserBrowser } from '../create-user.type.ts';

export type LKCreateUserBrowser = CreateUserBrowser & {
	livekitApiKey?: string;
	livekitApiSecret?: string;
};
