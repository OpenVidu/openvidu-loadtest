import type { Request } from 'express';

export type LoadTestVideoResolution = 'low' | 'medium' | 'high';
export type LoadTestVideoCodec = 'h264' | 'vp8';

/**
 * Body of a request to launch an `lk load-test` run. A single run spawns many
 * publishers/subscribers in one room, unlike the per-participant streamManager path.
 */
export interface LoadTestRunRequest {
	openviduUrl: string;
	livekitApiKey: string;
	livekitApiSecret: string;
	room: string;
	videoPublishers?: number;
	audioPublishers?: number;
	subscribers?: number;
	numPerSecond?: number;
	videoResolution?: LoadTestVideoResolution;
	videoCodec?: LoadTestVideoCodec;
	/** Simulcast is enabled by default in lk load-test; set false to add --no-simulcast. */
	simulcast?: boolean;
	identityPrefix?: string;
	layout?: string;
}

export interface LoadTestRunRequestExpress extends Request {
	body: LoadTestRunRequest;
}

export interface LoadTestRunResponse {
	runId: string;
	handleId: string;
	room: string;
	workerCpuUsage: number;
}
