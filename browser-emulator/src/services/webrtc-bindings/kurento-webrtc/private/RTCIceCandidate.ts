/**
 * Partial DOM type implementation: `Partial<RTCIceCandidate>`.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

type RTCIceComponent = 'rtcp' | 'rtp';
type RTCIceProtocol = 'tcp' | 'udp';
type RTCIceTcpCandidateType = 'active' | 'passive' | 'so';
type RTCIceCandidateType = 'host' | 'prflx' | 'relay' | 'srflx';

export interface RTCIceCandidateInit {
	candidate?: string;
	sdpMLineIndex?: number | null;
	sdpMid?: string | null;
	usernameFragment?: string | null;
}

export class RTCIceCandidate {
	readonly candidate: string; // Empty string == end-of-candidates indication.
	readonly component: RTCIceComponent | null = null;
	readonly foundation: string | null = null;
	readonly port: number | null = null;
	readonly priority: number | null = null;
	readonly protocol: RTCIceProtocol | null = null;
	readonly relatedAddress: string | null = null;
	readonly relatedPort: number | null = null;
	readonly sdpMLineIndex: number | null = null;
	readonly sdpMid: string | null = null;
	readonly tcpType: RTCIceTcpCandidateType | null = null;
	readonly type: RTCIceCandidateType | null = null;
	readonly usernameFragment: string | null = null;

	//https://www.w3.org/TR/webrtc/#dom-rtcicecandidate-constructor
	constructor(candidateInitDict: RTCIceCandidateInit = {}) {
		if (!candidateInitDict.sdpMid && !candidateInitDict.sdpMLineIndex) {
			throw new TypeError();
		}

		Object.assign(this, candidateInitDict);

		// TODO: this.candidate should now be parsed into separate properties.
	}
}
