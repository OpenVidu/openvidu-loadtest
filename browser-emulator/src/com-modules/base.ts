import type { LoadTestPostRequest } from "../types/api-rest.type.js";
import { SERVER_PORT } from '../config.js';

abstract class BaseComModule {

    protected static instance: BaseComModule;
    protected static _locationHostname = `localhost:${SERVER_PORT}`;

    static getInstance(): BaseComModule {
        return this.instance;
    }

    abstract processNewUserRequest(request: LoadTestPostRequest): Promise<void>;

    abstract areParametersCorrect(request: LoadTestPostRequest): boolean;

    abstract generateWebappUrl(request: LoadTestPostRequest): string;

    public static get locationHostname(): string {
        return BaseComModule._locationHostname;
    }
}

export default BaseComModule;