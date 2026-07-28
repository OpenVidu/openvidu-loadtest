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
	/** Simulcast is disabled by default; set true to opt in (omits --no-simulcast). */
	simulcast?: boolean;
	layout?: string;
	/**
	 * Whether each video publisher additionally counts as a subscriber, which is
	 * how a real participant behaves. Defaults to true. Set false to get exactly
	 * the requested geometry, e.g. publishers with no subscribers at all.
	 */
	publishersAlsoSubscribe?: boolean;
	/**
	 * Synthetic participant ids (e.g. "User1", "User2") assigned by the
	 * controller to this chunk's publishers/subscribers, in order. Used to
	 * index one webrtc-stats document per participant, matching the
	 * per-participant reporting NORMAL mode produces.
	 */
	participantIds?: string[];
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
