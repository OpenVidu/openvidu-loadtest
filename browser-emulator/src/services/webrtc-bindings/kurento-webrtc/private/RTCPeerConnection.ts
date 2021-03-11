/**
 * Partial implementation of DOM interface: Partial<RTCPeerConnection>.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

import * as KurentoClient from "./KurentoClient";

import { MediaStream } from "./MediaStream";
import { MediaStreamTrack } from "./MediaStreamTrack";
import { RTCIceCandidateInit } from "./RTCIceCandidate";
import { RTCRtpSender } from "./RTCRtpSender";
import { RTCSessionDescription } from "./RTCSessionDescription";
import { RTCSessionDescriptionInit } from "./RTCSessionDescription";

interface RTCConfiguration {}

interface RTCOfferOptions {
    offerToReceiveAudio?: boolean;
    offerToReceiveVideo?: boolean;
}

export class RTCPeerConnection {
    private kurentoWebRtcEp: any;
    private sendAudio: boolean = false;
    private sendVideo: boolean = false;

    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection
    constructor(configuration?: RTCConfiguration) {}

    public localDescription: RTCSessionDescription | null = null;
    public remoteDescription: RTCSessionDescription | null = null;

    public async addIceCandidate(
        candidate: RTCIceCandidateInit
    ): Promise<void> {
        const kurentoCandidate = new KurentoClient.getComplexType(
            "IceCandidate"
        )(candidate);
        await this.kurentoWebRtcEp.addIceCandidate(kurentoCandidate);
        return;
    }

    public addTrack(
        track: MediaStreamTrack,
        ...streams: MediaStream[]
    ): RTCRtpSender {
        if (track.kind === "audio") {
            this.sendAudio = true;
        } else if (track.kind === "video") {
            this.sendVideo = true;
        }

        return { track };
    }

    public async createOffer(
        options?: RTCOfferOptions
    ): Promise<RTCSessionDescriptionInit> {
        // Offer to send if either an audio or video track has been added.
        const offerToSend = this.sendAudio || this.sendVideo;

        // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer
        // The default behavior is to offer to receive only if the local side is
        // sending, not otherwise.
        let offerToReceive = false;
        if (
            !options ||
            (options.offerToReceiveAudio === undefined &&
                options.offerToReceiveVideo === undefined)
        ) {
            // Default behavior.
            offerToReceive = offerToSend;
        } else {
            offerToReceive =
                options.offerToReceiveAudio || options.offerToReceiveVideo;
        }

        const recvonly = offerToReceive && !offerToSend;
        const sendonly = offerToSend && !offerToReceive;

        this.kurentoWebRtcEp = await KurentoClient.makeWebRtcEndpoint(
            recvonly,
            sendonly
        );

        let sdpOffer: string;
        if (
            !options ||
            (options.offerToReceiveAudio === undefined &&
                options.offerToReceiveVideo === undefined)
        ) {
            // Default behavior.
            sdpOffer = await this.kurentoWebRtcEp.generateOffer();
        } else {
            sdpOffer = await this.kurentoWebRtcEp.generateOffer(
                new KurentoClient.getComplexType("OfferOptions")({
                    offerToReceiveAudio: options.offerToReceiveAudio === true,
                    offerToReceiveVideo: options.offerToReceiveVideo === true,
                })
            );
        }

        const description: RTCSessionDescriptionInit = {
            sdp: sdpOffer,
            type: "offer",
        };

        this.localDescription = new RTCSessionDescription(description);

        return description;
    }

    /*
    Throws:
    - SDP_PARSE_ERROR If the offer is empty or has errors.
    - SDP_END_POINT_ALREADY_NEGOTIATED If the endpoint is already negotiated.
    - SDP_END_POINT_PROCESS_ANSWER_ERROR if the result of processing the answer
      an empty string. This is most likely due to an internal error.
    - SDP_END_POINT_NOT_OFFER_GENERATED If the method is invoked before the
      generateOffer method.
    */
    public async setRemoteDescription(
        description: RTCSessionDescriptionInit
    ): Promise<void> {
        if (!description.sdp) {
            throw new Error("SDP is missing");
        }

        this.remoteDescription = new RTCSessionDescription(description);

        const sdpAnswer = await this.kurentoWebRtcEp.processAnswer(
            description.sdp
        );

        const localDescription: RTCSessionDescriptionInit = {
            sdp: sdpAnswer,
            type: "answer",
        };

        this.localDescription = new RTCSessionDescription(localDescription);
    }
}
