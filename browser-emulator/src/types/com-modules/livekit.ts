import type { CreateUserBrowser } from '../api-rest.type.js';

export type LKLoadTestPostRequest = CreateUserBrowser & {
	livekitApiKey?: string;
	livekitApiSecret?: string;
};
