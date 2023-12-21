import { IWebrtcStats, LoadTestPostRequest } from "../api-rest.type";

export interface LKLoadTestPostRequest extends LoadTestPostRequest {
    livekitApiKey?: string,
    livekitApiSecret?: string,
}

export interface IWebrtcStatsLK extends IWebrtcStats {
    inbound?: {
        audio: {
            bytesReceived?: number,
            concealedSamples?: number,
            concealedEvents?: number,
            jitter?: number,
            silentConcealedSamples?: number,
            silentConcealmentEvents?: number,
            timestamp?: number,
            totalAudioEnergy?: number,
            totalSamplesDuration?: number,
            type?: string,

            audioLevel?: number,
            fecPacketsDiscarded?: number,
            fecPacketsReceived?: number,
            insertedSamplesForDeceleration?: number,
            jitterBufferDelay?: number,
            jitterBufferEmittedCount?: number,
            lastPacketReceivedTimestamp?: number,
            packetsDiscarded?: number,
            packetsLost?: number,
            packetsReceived?: number,
            removedSamplesForAcceleration?: number,
            ssrc?: number,
            totalSamplesReceived?: number,
        } | {},
        video: {
            bytesReceived?: number,
            decoderImplementation?: any,
            firCount?: number,
            frameHeight?: number,
            frameWidth?: number,
            framesDecoded?: number,
            framesDropped?: number,
            framesReceived?: number
            jitter?: number,
            mimeType?: string,
            nackCount?: number,
            packetsLost?: number,
            packetsReceived?: number,
            pliCount?: number,
            timestamp?: number,
            type?: string,

            ssrc?: number,
            discardedPackets?: number,
            packetsDiscarded?: number,
            framesPerSecond?: number,
            jitterBufferDelay?: number,
            jitterBufferEmittedCount?: number,
            lastPacketReceivedTimestamp?: number,
            totalDecodeTime?: number,
            totalInterFrameDelay?: number,
            totalProcessingDelay?: number,
            totalSquaredInterFrameDelay?: number,
        } | {}
    },
    outbound?: {
        audio: {
            bytesSent?: number,
            packetsSent?: number,
            jitter?: number,
            packetsLost?: number,
            roundTripTime?: number,
            streamId?: string,
            timestamp?: number,
            type?: string,

            nackCount?: number
        } | {},
        video: {
            bytesSent?: number,
            firCount?: number,
            frameHeight?: number,
            frameWidth?: number,
            framesSent?: number
            jitter?: number,
            nackCount?: number,
            packetsLost?: number,
            packetsSent?: number,
            pliCount?: number,
            qualityLimitationReason?: string,
            qualityLimitationResolutionChanges?: number,
            retransmittedPacketsSent?: number,
            rid?: string,
            roundTripTime?: number,
            streamId?: string,
            timestamp?: number,

            framesPerSecond?: number,
            framesEncoded?: number,
            hugeFramesSent?: number,
            qpSum?: number
        } | {}
    }
}