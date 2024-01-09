const localTracks = [];
const remoteTracks = [];

/**
 * Based on openvidu-browser implementation
 * TODO: getCommonStats should be run as an interval for each user, including local
 * refactor
 */
class LKWebRTCStatsProvider extends WebRTCStatsProvider {
    // trackInfo = {
    //     track: track,
    //     participantId: participantId,
    //     sessionId: sessionId,
    //     type: type,
    //     videoHeight: height,
    //     videoWidth: width,
    //     isLocal: isLocal
    // }
    constructor(webRtcStatsManager, trackInfo) {
        super(webRtcStatsManager, trackInfo.participantId, trackInfo.sessionId);
        this.trackInfo = trackInfo;
    }

    async getStats() {
        let response = {};
        const stats = await this.trackInfo.track.getRTCStatsReport();
        if (this.trackInfo.isLocal) {
            response.outbound = {};
            const senderStats = await this.trackInfo.track.getSenderStats();
            if (this.trackInfo.type === 'audio') {
                this.localAudio(response, senderStats, stats);
            } else {
                this.localVideo(response, senderStats, stats);
            }
        } else {
            response.inbound = {};
            if (this.trackInfo.type === 'audio') {
                this.remoteAudio(response, stats);
            } else {
                this.remoteVideo(response, stats);
            }
        }
        return response;
    }

    localAudio(response, senderStats, stats) {
        if (!!senderStats && !!stats) {
            response.outbound.audio = senderStats;
            for (const stat of stats.values()) {
                if (stat.type === 'outbound-rtp') {
                    response.outbound.audio.nackCount = stat.nackCount;
                    // Only tested in Firefox atm, maybe in different browsers there is interesting information to add here
                }
            }
        }
    }

    localVideo(response, senderStats, stats) {
        // LiveKit sends 2 qualities of video, choose the one displayed
        const isCorrectStat = (stat) => (stat.frameHeight === this.trackInfo.videoHeight) && (stat.frameWidth === this.trackInfo.videoWidth);
        if (!!senderStats && !!stats) {
            const filteredStats = senderStats.filter(isCorrectStat);
            if (filteredStats.length > 0) {
                response.outbound.video = filteredStats[0];
                for (const stat of stats.values()) {
                    if ((stat.type === 'outbound-rtp') && isCorrectStat(stat)) {
                        response.outbound.video.framesPerSecond = stat.framesPerSecond;
                        response.outbound.video.framesEncoded = stat.framesEncoded;
                        response.outbound.video.qpSum = stat.qpSum;
                        response.outbound.video.hugeFramesSent = stat.hugeFramesSent;
                        // Only tested in Firefox atm, maybe in different browsers there is interesting information to add here
                    }
                }
            }
        }
    }

    remoteAudio(response, stats) {
        if (!!stats) {
            response.inbound.audio = {};
            for (const stat of stats.values()) {
                if (stat.type === 'inbound-rtp') {
                    response.inbound.audio.bytesReceived = stat.bytesReceived;
                    response.inbound.audio.concealedSamples = stat.concealedSamples;
                    response.inbound.audio.concealedEvents = stat.concealedEvents;
                    response.inbound.audio.jitter = stat.jitter;
                    response.inbound.audio.silentConcealedSamples = stat.silentConcealedSamples;
                    response.inbound.audio.silentConcealmentEvents = stat.silentConcealmentEvents;
                    response.inbound.audio.timestamp = stat.timestamp;
                    response.inbound.audio.totalAudioEnergy = stat.totalAudioEnergy;
                    response.inbound.audio.totalSamplesDuration = stat.totalSamplesDuration;
                    response.inbound.audio.type = stat.type;

                    response.inbound.audio.audioLevel = stat.nackCount;
                    response.inbound.audio.fecPacketsDiscarded = stat.fecPacketsDiscarded;
                    response.inbound.audio.fecPacketsReceived = stat.fecPacketsReceived;
                    response.inbound.audio.insertedSamplesForDeceleration = stat.insertedSamplesForDeceleration;
                    response.inbound.audio.jitterBufferDelay = stat.jitterBufferDelay;
                    response.inbound.audio.jitterBufferEmittedCount = stat.jitterBufferEmittedCount;
                    response.inbound.audio.lastPacketReceivedTimestamp = stat.lastPacketReceivedTimestamp;
                    response.inbound.audio.packetsDiscarded = stat.packetsDiscarded;
                    response.inbound.audio.packetsLost = stat.packetsLost;
                    response.inbound.audio.packetsReceived = stat.packetsReceived;
                    response.inbound.audio.removedSamplesForAcceleration = stat.removedSamplesForAcceleration;
                    response.inbound.audio.ssrc = stat.ssrc;
                    response.inbound.audio.totalSamplesReceived = stat.totalSamplesReceived;
                    // Only tested in Firefox atm, maybe in different browsers there is interesting information to add here
                }
            }
        }
    }

    remoteVideo(response, stats) {
        if (!!stats) {
            response.inbound.video = {};
            for (const stat of stats.values()) {
                if (stat.type === 'inbound-rtp') {
                    response.inbound.video.bytesReceived = stat.bytesReceived;
                    response.inbound.video.decoderImplementation = stat.decoderImplementation;
                    response.inbound.video.firCount = stat.firCount;
                    response.inbound.video.frameHeight = stat.frameHeight;
                    response.inbound.video.frameWidth = stat.frameWidth;
                    response.inbound.video.framesDecoded = stat.framesDecoded;
                    response.inbound.video.framesDropped = stat.framesDropped;
                    response.inbound.video.framesReceived = stat.framesReceived;
                    response.inbound.video.jitter = stat.jitter;
                    response.inbound.video.mimeType = stat.mimeType;
                    response.inbound.video.nackCount = stat.nackCount;
                    response.inbound.video.packetsLost = stat.packetsLost;
                    response.inbound.video.packetsReceived = stat.packetsReceived;
                    response.inbound.video.pliCount = stat.pliCount;
                    response.inbound.video.timestamp = stat.timestamp;
                    response.inbound.video.type = stat.type;
    
                    response.inbound.video.ssrc = stat.ssrc;
                    response.inbound.video.discardedPackets = stat.discardedPackets;
                    response.inbound.video.packetsDiscarded = stat.packetsDiscarded;
                    response.inbound.video.framesPerSecond = stat.framesPerSecond;
                    response.inbound.video.jitterBufferDelay = stat.jitterBufferDelay;
                    response.inbound.video.jitterBufferEmittedCount = stat.jitterBufferEmittedCount;
                    response.inbound.video.totalDecodeTime = stat.totalDecodeTime;
                    response.inbound.video.totalInterFrameDelay = stat.totalInterFrameDelay;
                    response.inbound.video.totalProcessingDelay = stat.totalProcessingDelay;
                    response.inbound.video.totalSquaredInterFrameDelay = stat.totalSquaredInterFrameDelay;
                    // Only tested in Firefox atm, maybe in different browsers there is interesting information to add here
                }
            }
        }
    }

    async printStats() {
        const stats = await getStats();
        console.log(stats);
    }
}
