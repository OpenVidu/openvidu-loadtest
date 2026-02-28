import type {
	LoadTestPostRequest,
	TestProperties,
} from '../types/api-rest.type.js';
import BaseComModule from './base.js';

export const PUBLIC_DIR = 'public';
class OpenviduComModule extends BaseComModule {
	static getInstance(): BaseComModule {
		if (!BaseComModule.instance) {
			BaseComModule.instance = new OpenviduComModule();
		}
		return BaseComModule.instance;
	}

	async processNewUserRequest(_req: LoadTestPostRequest): Promise<void> {
		// do nothing, openvidu 2 does not need any backend processing
	}

	areParametersCorrect(request: LoadTestPostRequest): boolean {
		const openviduSecret: string | undefined = request.openviduSecret;
		const openviduUrl: string = request.openviduUrl;
		const token: string | undefined = request.token;
		let properties: TestProperties = request.properties;

		const userConditions =
			!!properties.userId && !!properties.sessionName && !!openviduUrl;

		const tokenCanBeCreated = userConditions && !!openviduSecret;
		const tokenHasBeenReceived = !!properties.userId && !!token;
		const openviduConditions = tokenCanBeCreated || tokenHasBeenReceived;

		return openviduConditions;
	}

	generateWebappUrl(request: LoadTestPostRequest): string {
		const properties: TestProperties = request.properties;
		const token: string | undefined = request.token;
		const publicUrl = `publicurl=${request.openviduUrl}&`;
		const secret = request.openviduSecret
			? `secret=${request.openviduSecret}&`
			: '';
		const recordingMode = properties.recordingOutputMode
			? `recordingmode=${properties.recordingOutputMode}&`
			: '';
		const tokenParam = token ? `token=${token}` : '';
		const qoeAnalysis = !!process.env['QOE_ANALYSIS'];
		return (
			`https://${OpenviduComModule.locationHostname}/?` +
			publicUrl +
			secret +
			recordingMode +
			tokenParam +
			`role=${properties.role}&` +
			`sessionId=${properties.sessionName}&` +
			`userId=${properties.userId}&` +
			`audio=${properties.audio}&` +
			`video=${properties.video}&` +
			`resolution=${properties.resolution}&` +
			`showVideoElements=${properties.showVideoElements}&` +
			`frameRate=${properties.frameRate}&` +
			`qoeAnalysis=${qoeAnalysis}`
		);
	}
}

export default OpenviduComModule;
