import type { ConfigService } from '../../services/config.service.ts';
import type {
	OVCreateUserBrowser,
	OVUserJoinProperties,
} from '../../types/com-modules/openvidu.ts';
import BaseComModule from '../base.ts';

export default class OpenviduComModule extends BaseComModule {
	private readonly _PUBLIC_DIR = `public`;
	private readonly configService: ConfigService;

	constructor(configService: ConfigService) {
		super();
		this.configService = configService;
	}

	get PUBLIC_DIR(): string {
		return this._PUBLIC_DIR;
	}

	async processNewUserRequest(): Promise<void> {
		// do nothing, openvidu 2 does not need any backend processing
	}

	areParametersCorrect(request: OVCreateUserBrowser): boolean {
		const openviduSecret: string | undefined = request.openviduSecret;
		const openviduUrl: string = request.openviduUrl;
		const token: string | undefined = request.token;
		const properties: OVUserJoinProperties = request.properties;

		const userConditions =
			!!properties.userId && !!properties.sessionName && !!openviduUrl;

		const tokenCanBeCreated = userConditions && !!openviduSecret;
		const tokenHasBeenReceived = !!properties.userId && !!token;
		const openviduConditions = tokenCanBeCreated || tokenHasBeenReceived;

		return openviduConditions;
	}

	generateWebappUrl(request: OVCreateUserBrowser): string {
		const properties: OVUserJoinProperties = request.properties;
		const token: string | undefined = request.token;
		const publicUrl = `publicurl=${request.openviduUrl}&`;
		const secret = request.openviduSecret
			? `secret=${request.openviduSecret}&`
			: '';
		const recordingMode = properties.recordingOutputMode
			? `recordingmode=${properties.recordingOutputMode}&`
			: '';
		const tokenParam = token ? `token=${token}` : '';
		const qoeAnalysis = request.properties.mediaRecorders;
		return (
			`https://localhost:${this.configService.getServerPort()}/?` +
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
