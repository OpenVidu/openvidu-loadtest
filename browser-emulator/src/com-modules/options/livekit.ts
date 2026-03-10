import { AccessToken } from 'livekit-server-sdk';
import type { LKCreateUserBrowser } from '../../types/com-modules/livekit.ts';
import type { ConfigService } from '../../services/config.service.ts';
import BaseComModule from '../base.ts';
import type { UserJoinProperties } from '../../types/create-user.type.ts';

export default class LiveKitComModule extends BaseComModule {
	private readonly _PUBLIC_DIR = `public-lk`;
	private readonly configService: ConfigService;

	constructor(configService: ConfigService) {
		super();
		this.configService = configService;
	}

	get PUBLIC_DIR(): string {
		return this._PUBLIC_DIR;
	}

	async processNewUserRequest(request: LKCreateUserBrowser): Promise<void> {
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

	areParametersCorrect(request: LKCreateUserBrowser): boolean {
		const openviduUrl: string = request.openviduUrl;
		const properties: UserJoinProperties = request.properties;

		const userConditions =
			!!properties.userId && !!properties.sessionName && !!openviduUrl;
		const livekitConditions =
			userConditions &&
			!!request.livekitApiKey &&
			!!request.livekitApiSecret;

		return livekitConditions;
	}

	generateWebappUrl(request: LKCreateUserBrowser): string {
		const properties: UserJoinProperties = request.properties;
		const token: string | undefined = request.token;
		const publicUrl = `publicurl=${request.openviduUrl}&`;
		const tokenParam = token ? `token=${token}&` : '';
		const qoeAnalysis = !!process.env.QOE_ANALYSIS;
		return (
			`https://localhost:${this.configService.getServerPort()}/?` +
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
