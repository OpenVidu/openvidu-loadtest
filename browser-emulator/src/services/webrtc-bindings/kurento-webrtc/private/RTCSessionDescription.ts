/**
 * Partial DOM type implementation: `Partial<RTCSessionDescription>`.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

type RTCSdpType = 'answer' | 'offer' | 'pranswer' | 'rollback';

export interface RTCSessionDescriptionInit {
	// lib.dom.d.ts makes these optional, but the WebRTC spec does not!
	// https://www.w3.org/TR/webrtc/#dom-rtcsessiondescriptioninit
	sdp: string;
	type: RTCSdpType;
}

export class RTCSessionDescription {
	readonly sdp: string = '';
	readonly type: RTCSdpType;

	// https://www.w3.org/TR/webrtc/#dom-rtcsessiondescription-constructor
	constructor(descriptionInitDict?: RTCSessionDescriptionInit) {
		if (descriptionInitDict) {
			Object.assign(this, descriptionInitDict);
		}
	}
}
