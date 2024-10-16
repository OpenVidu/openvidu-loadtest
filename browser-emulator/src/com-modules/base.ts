import { LoadTestPostRequest } from "../types/api-rest.type";
import { SERVER_PORT} from '../config';
import { Request } from "express";

abstract class BaseComModule {

    protected static instance: BaseComModule | undefined;

    static getInstance(): BaseComModule | undefined {
        return this.instance;
    }

    abstract processNewUserRequest(request: LoadTestPostRequest): Promise<any>;

    abstract areParametersCorrect(request: LoadTestPostRequest): boolean;

    setEnvironmentParams(req: Request): void {
        process.env.LOCATION_HOSTNAME = `localhost:${SERVER_PORT}`;
    };

    abstract generateWebappUrl(request: LoadTestPostRequest): string;
}

export default BaseComModule;