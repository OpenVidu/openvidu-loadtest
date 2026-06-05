import type { Request } from 'express';
import type { JSONStatsResponse } from './json.type.ts';

export interface WebRTCStatsRequest extends Request {
	body: JSONStatsResponse;
}
