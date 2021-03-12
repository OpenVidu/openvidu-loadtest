/**
 * Partial implementation of DOM interface: Partial<RTCPeerConnection>.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

import * as KurentoClient from "./KurentoClient";

import { Event } from "./Event";
import { MediaStream } from "./MediaStream";
import { MediaStreamTrack } from "./MediaStreamTrack";
import { RTCIceCandidate } from "./RTCIceCandidate";
import { RTCIceCandidateInit } from "./RTCIceCandidate";
import { RTCRtpSender } from "./RTCRtpSender";
import { RTCSessionDescription } from "./RTCSessionDescription";
import { RTCSessionDescriptionInit } from "./RTCSessionDescription";

import { EventEmitter } from "events";

interface RTCConfiguration {}

interface RTCOfferOptions {
    offerToReceiveAudio?: boolean;
    offerToReceiveVideo?: boolean;
}

type RTCSignalingState =
    | "closed"
    | "have-local-offer"
    | "have-local-pranswer"
    | "have-remote-offer"
    | "have-remote-pranswer"
    | "stable";

class RTCPeerConnectionIceEvent extends Event {
    readonly candidate: RTCIceCandidate | null = null;
    readonly url: string | null = null;

    constructor(
        type: string,
        initDict: Partial<RTCPeerConnectionIceEvent> = {}
    ) {
        super(type);
        Object.assign(this, initDict);
    }
}

export class RTCPeerConnection extends EventEmitter {
    private recvAudio: boolean = false;
    private recvVideo: boolean = false;
    private sendAudio: boolean = false;
    private sendVideo: boolean = false;

    private kurentoWebRtcEp: any = null;

    private async makeWebRtcEndpoint(
        recvonly: boolean = false,
        sendonly: boolean = false
    ): Promise<any> {
        if (this.kurentoWebRtcEp) {
            throw new Error("BUG: Multiple WebRtcEndpoints would be created");
        }

        const kurentoWebRtcEp = await KurentoClient.makeWebRtcEndpoint(
            recvonly,
            sendonly
        );

        console.debug("DEBUG [RTCPeerConnection.makeWebRtcEndpoint] NEW EP");

        kurentoWebRtcEp.on("IceCandidateFound", this.onKurentoIceCandidate);

        return kurentoWebRtcEp;
    }

    private onKurentoIceCandidate(event: any): void {
        console.debug(
            "DEBUG [RTCPeerConnection.onKurentoIceCandidate] event:",
            event
        );

        const kurentoCandidate = new KurentoClient.getComplexType(
            "IceCandidate"
        )(event.candidate);

        // https://www.w3.org/TR/webrtc/#dom-rtcpeerconnectioniceevent
        const iceEvent = new RTCPeerConnectionIceEvent("icecandidate", {
            candidate: new RTCIceCandidate({
                candidate: kurentoCandidate.candidate,
                sdpMLineIndex: kurentoCandidate.sdpMLineIndex,
                sdpMid: kurentoCandidate.sdpMid,
            }),
        });

        console.debug(
            "DEBUG [RTCPeerConnection.onKurentoIceCandidate] iceEvent:",
            iceEvent
        );

        this.emit(iceEvent.type, iceEvent);
        if (this.onicecandidate) {
            this.onicecandidate(iceEvent);
        }
    }

    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection
    constructor(configuration?: RTCConfiguration) {
        super();
    }

    public localDescription: RTCSessionDescription | null = null;
    public remoteDescription: RTCSessionDescription | null = null;

    // https://www.w3.org/TR/webrtc/#dom-rtcsignalingstate
    private _signalingState: RTCSignalingState = "stable";

    public get signalingState(): RTCSignalingState {
        return this._signalingState;
    }

    public set signalingState(value: RTCSignalingState) {
        this._signalingState = value;

        const event = new Event("signalingstatechange");

        console.debug(
            `DEBUG [RTCPeerConnection set signalingState] Emit event: ${event}, state: ${this.signalingState}`
        );

        this.emit(event.type, event);
        if (this.onsignalingstatechange) {
            this.onsignalingstatechange(event);
        }
    }

    public onicecandidate:
        | ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => any)
        | null = null;
    public onsignalingstatechange:
        | ((this: RTCPeerConnection, ev: Event) => any)
        | null = null;

    public async addIceCandidate(
        candidate: RTCIceCandidateInit
    ): Promise<void> {
        // console.debug("DEBUG [RTCPeerConnection.addIceCandidate] candidate:", candidate);

        if (!this.kurentoWebRtcEp) {
            throw new Error("BUG: Kurento WebRtcEndpoint doesn't exist");
        }

        const kurentoCandidate = new KurentoClient.getComplexType(
            "IceCandidate"
        )(candidate);
        await this.kurentoWebRtcEp.addIceCandidate(kurentoCandidate);
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

    public close(): void {
        this.signalingState = "closed";

        this.kurentoWebRtcEp.release();
        delete this.kurentoWebRtcEp;
    }

    public async createAnswer(
        _options?: RTCOfferOptions
    ): Promise<RTCSessionDescriptionInit> {
        // This should be the first and only WebRtcEndpoint.
        this.kurentoWebRtcEp = await this.makeWebRtcEndpoint();

        // Kurento returns an SDP Answer, based on the remote Offer.
        const sdpAnswer = await this.kurentoWebRtcEp.processOffer(
            this.remoteDescription.sdp
        );

        // Start ICE candidate gathering on Kurento.
        console.debug(
            "DEBUG [RTCPeerConnection.createAnswer] Kurento WebRtcEndpoint gatherCandidates()"
        );
        await this.kurentoWebRtcEp.gatherCandidates();

        return {
            sdp: sdpAnswer,
            type: "answer",
        };
    }

    public async createOffer(
        options?: RTCOfferOptions
    ): Promise<RTCSessionDescriptionInit> {
        // Offer to send if either an audio or video track has been added.
        const offerToSend = this.sendAudio || this.sendVideo;

        // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer
        // The default behavior is to offer to receive only if the local side is
        // sending, not otherwise.
        let offerToReceive = offerToSend;
        if (
            options &&
            options.offerToReceiveAudio === false &&
            options.offerToReceiveVideo === false
        ) {
            offerToReceive = false;
        }

        const recvonly = offerToReceive && !offerToSend;
        const sendonly = offerToSend && !offerToReceive;

        // This should be the first and only WebRtcEndpoint.
        this.kurentoWebRtcEp = await this.makeWebRtcEndpoint(
            recvonly,
            sendonly
        );

        const offerAudio = this.sendAudio || options.offerToReceiveAudio;
        const offerVideo = this.sendVideo || options.offerToReceiveVideo;

        let sdpOffer: string;
        if (offerAudio && offerVideo) {
            // Default behavior.
            sdpOffer = await this.kurentoWebRtcEp.generateOffer();
        } else {
            sdpOffer = await this.kurentoWebRtcEp.generateOffer(
                new KurentoClient.getComplexType("OfferOptions")({
                    // FIXME: These names are misleading! The API is wrong, and
                    // they should be just "offerAudio", "offerVideo".
                    offerToReceiveAudio: offerAudio,
                    offerToReceiveVideo: offerVideo,
                })
            );
        }

        // Start ICE candidate gathering on Kurento.
        console.debug(
            "DEBUG [RTCPeerConnection.createOffer] Kurento WebRtcEndpoint gatherCandidates()"
        );
        await this.kurentoWebRtcEp.gatherCandidates();

        return {
            sdp: sdpOffer,
            type: "offer",
        };
    }

    public async setLocalDescription(
        description: RTCSessionDescriptionInit
    ): Promise<void> {
        // Update signaling state.
        // https://www.w3.org/TR/webrtc/#dom-rtcsignalingstate
        if (this.signalingState === "stable" && description.type === "offer") {
            this.signalingState = "have-local-offer";
        } else if (
            this.signalingState === "have-remote-offer" &&
            description.type === "answer"
        ) {
            this.signalingState = "stable";
        } else {
            throw new Error(
                `Bad signaling, state '${this.signalingState}' doesn't accept local descriptions of type '${description.type}'`
            );
        }
        this.localDescription = description;
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
        // Update signaling state.
        // https://www.w3.org/TR/webrtc/#dom-rtcsignalingstate
        if (this.signalingState === "stable" && description.type === "offer") {
            this.signalingState = "have-remote-offer";
        } else if (
            this.signalingState === "have-local-offer" &&
            description.type === "answer"
        ) {
            // Kurento returns an updated SDP Offer, based on the remote Answer.
            const sdpOffer = await this.kurentoWebRtcEp.processAnswer(
                description.sdp
            );
            this.localDescription = {
                sdp: sdpOffer,
                type: "offer",
            };

            this.signalingState = "stable";
        } else {
            throw new Error(
                `Bad signaling, state '${this.signalingState}' doesn't accept remote descriptions of type '${description.type}'`
            );
        }
        this.remoteDescription = description;
    }
}
