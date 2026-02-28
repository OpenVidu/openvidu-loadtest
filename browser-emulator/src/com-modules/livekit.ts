import { AccessToken } from 'livekit-server-sdk';
import type { LKLoadTestPostRequest } from '../types/com-modules/livekit.js';
import type { TestProperties } from '../types/api-rest.type.js';
import BaseComModule from './base.js';

export const PUBLIC_DIR = 'public-lk';
class LiveKitComModule extends BaseComModule {
	static getInstance(): BaseComModule {
		if (!BaseComModule.instance) {
			BaseComModule.instance = new LiveKitComModule();
		}
		return BaseComModule.instance;
	}

	async processNewUserRequest(request: LKLoadTestPostRequest): Promise<void> {
		// Generate LiveKit Token
		const roomName = request.properties.sessionName;
		const participantName = request.properties.userId;

		const apiKey = request.livekitApiKey;
		const apiSecret = request.livekitApiSecret;

		const at = new AccessToken(apiKey, apiSecret, {
			identity: participantName,
			// add metadata to the token, which will be available in the participant's metadata
			metadata: JSON.stringify({ livekitUrl: request.openviduUrl }),
		});
		at.addGrant({ roomJoin: true, room: roomName });
		const token = await at.toJwt();

		request.token = token;

		console.log(token);
	}

	areParametersCorrect(request: LKLoadTestPostRequest): boolean {
		const openviduUrl: string = request.openviduUrl;
		let properties: TestProperties = request.properties;

		const userConditions =
			!!properties.userId && !!properties.sessionName && !!openviduUrl;
		const livekitConditions =
			userConditions &&
			!!request.livekitApiKey &&
			!!request.livekitApiSecret;

		return livekitConditions;
	}

	generateWebappUrl(request: LKLoadTestPostRequest): string {
		const properties: TestProperties = request.properties;
		const token: string | undefined = request.token;
		const publicUrl = `publicurl=${request.openviduUrl}&`;
		const tokenParam = !!token ? `token=${token}&` : '';
		const qoeAnalysis = !!process.env['QOE_ANALYSIS'];
		return (
			`https://${LiveKitComModule.locationHostname}/?` +
			publicUrl +
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

export default LiveKitComModule;
