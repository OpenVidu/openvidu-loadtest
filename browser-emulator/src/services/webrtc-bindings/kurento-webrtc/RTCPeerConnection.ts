import * as KurentoClient from "kurento-client";

export class KurentoRTCPeerConnection implements Partial<RTCPeerConnection> {
    private kurentoClient: any;
    private kurentoPipeline: any;
    private kurentoWebRtcEp: any;

    private notImplemented(): never {
        throw new Error("[KurentoRTCPeerConnection] NOT IMPLEMENTED");
    }

    constructor(kurentoUrl: string) {
        console.log(
            "[KurentoWebRtc] Connect with Kurento Media Server:",
            kurentoUrl
        );

        this.kurentoClient = KurentoClient.getSingleton(kurentoUrl);
        console.log("[KurentoWebRtc] Kurento client connected");
    }

    async init(): Promise<void> {
        this.kurentoPipeline = await this.kurentoClient.create("MediaPipeline");
        console.log("[init] Kurento pipeline created");

        this.kurentoWebRtcEp = await this.kurentoPipeline.create(
            "WebRtcEndpoint",
            {
                sendonly: true,
            }
        );
        console.log("[init] Kurento WebRtcEndpoint created");
    }

    // interface RTCPeerConnection
    // ===========================

    async addIceCandidate(
        candidate: RTCIceCandidateInit | RTCIceCandidate
    ): Promise<void> {
        const kurentoCandidate = new KurentoClient.getComplexType(
            "IceCandidate"
        )(candidate);
        await this.kurentoWebRtcEp.addIceCandidate(kurentoCandidate);
        return;
    }

    addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
        /*
        interface RTCRtpSender {
            readonly dtmf: RTCDTMFSender | null;
            readonly rtcpTransport: RTCDtlsTransport | null;
            readonly track: MediaStreamTrack | null;
            readonly transport: RTCDtlsTransport | null;
            getParameters(): RTCRtpSendParameters;
            getStats(): Promise<RTCStatsReport>;
            replaceTrack(withTrack: MediaStreamTrack | null): Promise<void>;
            setParameters(parameters: RTCRtpSendParameters): Promise<void>;
            setStreams(...streams: MediaStream[]): void;
        }
        */

        this.notImplemented();
        return new RTCRtpSender();
    }

    close(): void {
        this.notImplemented();
    }

    async createOffer(
        options?: RTCOfferOptions
    ): Promise<RTCSessionDescriptionInit> {
        let sdp: string;
        if (options) {
            sdp = await this.kurentoWebRtcEp.generateOffer(
                new KurentoClient.getComplexType("OfferOptions")({
                    offerToReceiveAudio: options.offerToReceiveAudio
                        ? options.offerToReceiveAudio
                        : false,
                    offerToReceiveVideo: options.offerToReceiveVideo
                        ? options.offerToReceiveVideo
                        : false,
                })
            );
        } else {
            sdp = await this.kurentoWebRtcEp.generateOffer();
        }

        return {
            sdp,
            type: "offer",
        };
    }

    async setLocalDescription(
        description: RTCSessionDescriptionInit
    ): Promise<void> {
        this.notImplemented();
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
    async setRemoteDescription(
        description: RTCSessionDescriptionInit
    ): Promise<void> {
        await this.kurentoWebRtcEp.processAnswer(description.sdp);
    }
}
