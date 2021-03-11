/**
 * Partial implementation of DOM interface: Partial<RTCSessionDescription>.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

type RTCSdpType = "answer" | "offer" | "pranswer" | "rollback";

export interface RTCSessionDescriptionInit {
    sdp?: string;
    type?: RTCSdpType;
}

export class RTCSessionDescription {
    readonly sdp: string;
    readonly type: RTCSdpType;

    constructor(descriptionInitDict?: RTCSessionDescriptionInit)
    {
        if (descriptionInitDict && descriptionInitDict.sdp) {
            this.sdp = descriptionInitDict.sdp
        }
        else {
            this.sdp = "";
        }

        if (descriptionInitDict && descriptionInitDict.type) {
            this.type = descriptionInitDict.type
        }
        else {
            this.type = "offer";
        }
    }
}
