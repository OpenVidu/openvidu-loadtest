/**
 * Based on openvidu-browser implementation
 * Needs platform.js
 */
class WebRTCStatsManager {
    constructor(browserEmulatorConnector) {
        this.browserEmulatorConnector = browserEmulatorConnector;
        // When cross-site (aka third-party) cookies are blocked by the browser,
        // accessing localStorage in a third-party iframe throws a DOMException.
        let webrtcObj;
        try {
            let ITEM_NAME = 'webrtc-stats-config';
            webrtcObj = localStorage.getItem(ITEM_NAME);
        }
        catch(e){
            console.warn("localStorage for WebRTC stats not accessible in this context, stats won't be sent.");
        }

        if (!!webrtcObj) {
            this.webRtcStatsEnabled = true;
            this.webrtcStatsConfig = JSON.parse(webrtcObj);
            // webrtc object found in local storage
            console.warn(
                'WebRtc stats enabled'
            );
            console.warn('localStorage item: ' + JSON.stringify(webrtcStatsConfig));

            this.POST_URL = this.webrtcStatsConfig.httpEndpoint;
            this.statsInterval = this.webrtcStatsConfig.interval; // Interval in seconds

            this.savedElements = [];

        } else {
            console.debug('WebRtc stats not enabled');
        }
    }

    async sendStatsToHttpEndpoint(stats) {
        try {
            const response = this.generateJSONStatsResponse(stats);
            await this.sendStats(this.POST_URL, response);
        } catch (error) {
            console.error(error);
        }
    }

    generateJSONStatsResponse(participant_id, session_id, stats) {
        return {
            '@timestamp': new Date().toISOString(),
            participant_id,
            session_id,
            platform: platform.getName(),
            platform_description: platform.getDescription(),
            stream: 'webRTC',
            webrtc_stats: stats
        };
    }

    addProvider(provider) {
        if (this.webRtcStatsEnabled) {
            this.savedElements.push(provider);
        }
    }
}
var lastSavedStats;
// For each entity (track/stream) a WebRTCStatsProvider should be created
class WebRTCStatsProvider {
    constructor(webRtcStatsManager) {
        this.webRtcStatsManager = webRtcStatsManager;

        this.webRtcStatsIntervalId = setInterval(async () => {
            const stats = await this.getStats();
            await this.webRtcStatsIntervalId.sendStatsToHttpEndpoint(stats);
        }, this.webRtcStatsManager.statsInterval * 1000);
    }

    async getStats() {
        // getCommonStats should be implemented depending on the client sdk
        // should return a JSON object with the following structure:
        // {
        //     inbound?: {
        //         audio?: {},
        //         video?: {}
        //     },
        //     outbound?: {
        //         audio?: {},
        //         video?: {}
        //     }
        // }
        // audio and video objects are filled with the needed stats
        // check public-lk/livekit-stats.js for an example using LiveKit

        // TODO: implement getStats, throws error on this class as its supposed to be abstract
        // For LiveKit a class extending this should be implemented based on getCommonStats but for each track
        throw new Error("Not implemented, implement this class for each client sdk")
    }
}