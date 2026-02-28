import { LoadTestPostRequest } from "../api-rest.type.js";

export interface LKLoadTestPostRequest extends LoadTestPostRequest {
    livekitApiKey?: string,
    livekitApiSecret?: string,
}