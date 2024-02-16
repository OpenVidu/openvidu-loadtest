import { LoadTestPostRequest, TestProperties } from "../types/api-rest.type";
import { Request } from "express";
import BaseComModule from "./base";

export const PUBLIC_DIR = "public";
class OpenviduComModule extends BaseComModule {

    static getInstance(): BaseComModule {
        if (!BaseComModule.instance) {
            BaseComModule.instance = new OpenviduComModule();
        }
        return BaseComModule.instance;
    }

    processNewUserRequest(req: LoadTestPostRequest): Promise<any> {
        // do nothing, openvidu 2 does not need any backend processing
        return Promise.resolve([]);
    }

    areParametersCorrect(request: LoadTestPostRequest): boolean {
        const openviduSecret: string = request.openviduSecret;
        const openviduUrl: string = request.openviduUrl;
        const token: string = request.token;
        let properties: TestProperties = request.properties;

        const userConditions = !!properties.userId && !!properties.sessionName && !!openviduUrl;

        const tokenCanBeCreated = userConditions && !!openviduSecret;
        const tokenHasBeenReceived = !!properties.userId && !!token;
        const openviduConditions = tokenCanBeCreated || tokenHasBeenReceived;

        return openviduConditions;
    }

    setEnvironmentParams(req: Request): void {
        super.setEnvironmentParams(req);
        const request: LoadTestPostRequest = req.body;
	    process.env.OPENVIDU_SECRET = request.openviduSecret;
    }

    generateWebappUrl(request: LoadTestPostRequest): string {
        const properties: TestProperties = request.properties;
        const token: string = request.token;
        const publicUrl = `publicurl=${request.openviduUrl}&`;
		const secret = !!request.openviduSecret ? `secret=${request.openviduSecret}&` : '';
		const recordingMode = !!properties.recordingOutputMode ? `recordingmode=${properties.recordingOutputMode}&` : '';
		const tokenParam = !!token ? `token=${token}` : '';
		const qoeAnalysis = !!process.env.QOE_ANALYSIS;
		return (
			`https://${process.env.LOCATION_HOSTNAME}/?` +
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