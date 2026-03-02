import type { CreateUserBrowser } from '../types/api-rest.type.js';

export default abstract class BaseComModule {
	abstract processNewUserRequest(request: CreateUserBrowser): Promise<void>;

	abstract areParametersCorrect(request: CreateUserBrowser): boolean;

	abstract generateWebappUrl(request: CreateUserBrowser): string;

	abstract get PUBLIC_DIR(): string;
}
