/**
 * Based on openvidu-browser implementation
 * Needs platform.js
 */
class WebRTCStats {
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
            logger.warn(
                'WebRtc stats enabled'
            );
            logger.warn('localStorage item: ' + JSON.stringify(webrtcStatsConfig));

            this.POST_URL = this.webrtcStatsConfig.httpEndpoint;
            this.statsInterval = this.webrtcStatsConfig.interval; // Interval in seconds

            this.webRtcStatsIntervalId = setInterval(async () => {
                await this.sendStatsToHttpEndpoint();
            }, this.statsInterval * 1000);
        } else {
            logger.debug('WebRtc stats not enabled');
        }
    }

    async sendStatsToHttpEndpoint() {
        try {
            const webrtcStats = await getCommonStats();
            const response = this.generateJSONStatsResponse(webrtcStats);
            await this.sendStats(this.POST_URL, response);
        } catch (error) {
            logger.log(error);
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
}