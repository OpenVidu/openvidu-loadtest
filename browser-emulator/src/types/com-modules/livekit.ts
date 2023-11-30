import { LoadTestPostRequest } from "../api-rest.type";

export interface LKLoadTestPostRequest extends LoadTestPostRequest {
    livekitApiKey?: string,
    livekitApiSecret?: string,
}