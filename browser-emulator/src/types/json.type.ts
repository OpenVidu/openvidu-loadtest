import type { JSONStatsResponse, JSONStreamsInfo } from './api-rest.type.ts';

export type JsonPrimitive = string | number | boolean | Date | null;

// Extend with any other types we know are valid JSON for later stringification
export type JsonValue =
	| JSONStatsResponse
	| JSONStreamsInfo
	| JsonPrimitive
	| JsonValue[]
	| { [key: string]: JsonValue };
