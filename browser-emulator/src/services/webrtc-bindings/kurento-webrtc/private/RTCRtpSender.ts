/**
 * Partial DOM type implementation: `Partial<RTCRtpSender>`.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

import { MediaStreamTrack } from './MediaStreamTrack';

export class RTCRtpSender {
	readonly track: MediaStreamTrack | null = null;

	constructor(initDict: Partial<RTCRtpSender> = {}) {
		Object.assign(this, initDict);
	}
}
