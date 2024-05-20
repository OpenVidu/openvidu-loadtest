import { BrowserMode, LoadTestPostRequest } from "../types/api-rest.type";
import { DOCKER_NAME, SERVER_PORT} from '../config';
import { Request } from "express";

abstract class BaseComModule {

    protected static instance: BaseComModule | undefined;

    static getInstance(): BaseComModule | undefined {
        return this.instance;
    }

    abstract processNewUserRequest(request: LoadTestPostRequest): Promise<any>;

    abstract areParametersCorrect(request: LoadTestPostRequest): boolean;

    setEnvironmentParams(req: Request): void {
        if (process.env.IS_DOCKER_CONTAINER === 'true') {
            process.env.LOCATION_HOSTNAME = `${DOCKER_NAME}:${SERVER_PORT}`;
        } else {
            process.env.LOCATION_HOSTNAME = `localhost:${SERVER_PORT}`;
        }
        const request: LoadTestPostRequest = req.body;
	    process.env.KURENTO_RECORDING_ENABLED = String(request.properties.recording && request.browserMode === BrowserMode.EMULATE);
    };

    abstract generateWebappUrl(request: LoadTestPostRequest): string;
}

export default BaseComModule;