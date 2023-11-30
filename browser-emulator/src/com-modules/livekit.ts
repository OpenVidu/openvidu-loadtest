import { BaseComModule } from "./base";
import { AccessToken } from 'livekit-server-sdk';
import { LKLoadTestPostRequest } from '../types/com-modules/livekit';
import { TestProperties } from "../types/api-rest.type";
import { Request } from "express";

export class LiveKitComModule extends BaseComModule {

    static getInstance(): BaseComModule {
        if (!BaseComModule.instance) {
            BaseComModule.instance = new LiveKitComModule();
        }
        return BaseComModule.instance;
    }

    processNewUserRequest(request: LKLoadTestPostRequest): Promise<any> {
        // Generate LiveKit Token
        const roomName = request.properties.sessionName;
        const participantName = request.properties.userId;

        const apiKey = request.livekitApiKey;
        const apiSecret = request.livekitApiSecret;

        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName,
            // add metadata to the token, which will be available in the participant's metadata
            metadata: JSON.stringify({ livekitUrl: process.env.LIVEKIT_URL }),
        });
        at.addGrant({ roomJoin: true, room: roomName });
        const token = at.toJwt();

        request.token = token;
        
        return Promise.resolve(request);
    }

    areParametersCorrect(request: LKLoadTestPostRequest): boolean {
        const openviduUrl: string = request.openviduUrl;
        let properties: TestProperties = request.properties;

        const userConditions = !!properties.userId && !!properties.sessionName && !!openviduUrl;
        const livekitConditions = userConditions && !!request.livekitApiKey && !!request.livekitApiSecret;

        return livekitConditions;
    }


    setEnvironmentParams(req: Request): void {
        super.setEnvironmentParams(req);
        const request: LKLoadTestPostRequest = req.body;
        process.env.OPENVIDU_URL = request.openviduUrl;
        process.env.LIVEKIT_API_KEY = request.livekitApiKey;
        process.env.LIVEKIT_API_SECRET = request.livekitApiSecret;
    }

    generateWebappUrl(request: LKLoadTestPostRequest): string {
        const properties: TestProperties = request.properties;
        const token: string = request.token;
        const publicUrl = !!process.env.OPENVIDU_URL ? `publicurl=${process.env.OPENVIDU_URL}&` : '';
		const livekitApiKey = !!process.env.LIVEKIT_API_KEY ? `livekitapikey=${process.env.LIVEKIT_API_KEY}&` : '';
		const livekitApiSecret = !!process.env.LIVEKIT_API_SECRET ? `livekitapisecret=${process.env.LIVEKIT_API_SECRET}&` : '';
		const recordingMode = !!properties.recordingOutputMode ? `recordingmode=${properties.recordingOutputMode}&` : '';
		const tokenParam = !!token ? `token=${token}` : '';
		const qoeAnalysis = !!process.env.QOE_ANALYSIS;
		return (
			`https://${process.env.LOCATION_HOSTNAME}/?` +
			publicUrl +
			livekitApiKey +
			livekitApiSecret +
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