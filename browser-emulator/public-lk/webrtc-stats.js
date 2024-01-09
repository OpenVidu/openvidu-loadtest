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
        catch (e) {
            console.warn("localStorage for WebRTC stats not accessible in this context, stats won't be sent.");
        }

        if (!!webrtcObj) {
            this.webRtcStatsEnabled = true;
            this.webrtcStatsConfig = JSON.parse(webrtcObj);
            // webrtc object found in local storage
            console.debug(
                'WebRtc stats enabled'
            );
            console.debug('localStorage item: ' + JSON.stringify(this.webrtcStatsConfig));

            this.POST_URL = this.webrtcStatsConfig.httpEndpoint;
            if (!this.POST_URL) {
                console.error('WebRtc stats endpoint not found in localStorage item, stats won\'t be sent');
                this.webRtcStatsEnabled = false;
            } else {
                console.debug('WebRtc stats endpoint: ' + this.POST_URL);
                this.statsInterval = this.webrtcStatsConfig.interval; // Interval in seconds
                if (!this.statsInterval) {
                    console.warn('WebRtc stats interval not found in localStorage item, defaulting to 3 seconds');
                    this.statsInterval = 3;
                }
                console.debug('WebRtc stats interval: ' + this.statsInterval);
    
                this.sendInterval = this.webrtcStatsConfig.sendInterval; // Interval in seconds
                if (!this.sendInterval) {
                    console.warn('WebRtc send stats interval not found in localStorage item, defaulting to 15 seconds');
                    this.sendInterval = 15;
                }
                console.debug('WebRtc send stats interval: ' + this.sendInterval);
    
                this.savedElements = new Map();
                this.savedStats = [];

                this.sendIntervalId = setInterval(async () => {
                    const response = [];
                    for (let stat of this.savedStats) {
                        response.push(stat.provider.generateJSONStatsResponse(stat.stats));
                    }
                    this.savedStats = [];
                    await this.sendStatsToHttpEndpoint(response);
                }, this.sendInterval * 1000);
            }

        } else {
            console.warn('WebRtc stats not enabled');
        }
    }

    async sendStatsToHttpEndpoint(response) {
        try {
            await this.sendStats(this.POST_URL, response);
        } catch (error) {
            console.error(error);
        }
    }

    async sendStats(url, response) {
        try {
            const configuration = {
                headers: {
                    'Content-type': 'application/json'
                },
                body: JSON.stringify(response),
                method: 'POST'
            };
            await fetch(url, configuration);
        } catch (error) {
            console.error(`sendStats error: ${JSON.stringify(error)}`);
        }
    }

    addProvider(user, provider) {
        if (this.webRtcStatsEnabled) {
            this.savedElements.set(user, provider);
        }
    }

    getProvider(user) {
        if (this.webRtcStatsEnabled) {
            return this.savedElements.get(user);
        }
    }

    deleteProvider(user) {
        if (this.webRtcStatsEnabled) {
            let provider = this.savedElements.get(user);
            if (provider) {
                provider.destroy();
                this.savedElements.delete(user);
            }
        }
    }

    deleteAllProviders() {
        if (this.webRtcStatsEnabled) {
            for (let provider of this.savedElements.values()) {
                provider.destroy();
            }
            this.savedElements.clear();
        }
    }

    addStats(provider, stats) {
        if (this.webRtcStatsEnabled) {
            this.savedStats.push({provider, stats});
        }
    }
}

// For each entity (track/stream) a WebRTCStatsProvider should be created
class WebRTCStatsProvider {
    constructor(webRtcStatsManager, participantId, sessionId) {
        this.webRtcStatsManager = webRtcStatsManager;
        this.participantId = participantId;
        this.sessionId = sessionId;

        if (this.webRtcStatsManager.POST_URL) {
            this.webRtcStatsIntervalId = setInterval(async () => {
                const stats = await this.getStats();
                this.webRtcStatsManager.addStats(this, stats);
            }, this.webRtcStatsManager.statsInterval * 1000);
        } else {
            console.warn('WebRtc stats not enabled');
        }
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

    // Should be called when user exists session
    destroy() {
        clearInterval(this.webRtcStatsIntervalId);
    }

    generateJSONStatsResponse(stats) {
        return {
            '@timestamp': new Date().toISOString(),
            participant_id: this.participantId,
            session_id: this.sessionId,
            platform: platform.name,
            platform_description: platform.description,
            stream: 'webRTC',
            webrtc_stats: stats
        };
    }
}