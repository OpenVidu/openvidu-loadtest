import type { LoadTestPostRequest } from '../api-rest.type.js';

export type LKLoadTestPostRequest = LoadTestPostRequest & {
	livekitApiKey?: string;
	livekitApiSecret?: string;
};
