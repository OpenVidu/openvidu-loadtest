class WebRTCStatsManager {
    constructor(browserEmulatorConnector) {
        this.savedStats = [];
        this.webrtcStats = new WebRTCStats({
            // the interval in ms of how often we should get stats
            getStatsInterval: this.statsInterval * 1000,
            // if we should include the original RTCStatsReport map when firing the `stats` event
            rawStats: false,
            // include an object that resulted from transforming RTCStatsReport into an oject (`report.id` as the key)
            statsObject: false,
            // if we should filter out some stats
            filteredStats: false,
            // If the data object should contain a remote attribute that will contain stats for the remote peer, from `remote-inbound-rtp`, etc
            remote: true,
            // If we should wrap the `geUserMedia` calls so we can gather events when the methods is called or success/error
            wrapGetUserMedia: true,
            // If we should log messages
            debug: false,
            // Values: 'none', 'error', 'warn', 'info', 'debug'
            logLevel: 'warn'
        })
        
        this.webrtcStats.on('timeline', (ev) => {
            this.savedStats.push(ev)
        })
        this.browserEmulatorConnector = browserEmulatorConnector;
        // When cross-site (aka third-party) cookies are blocked by the browser,
        // accessing localStorage in a third-party iframe throws a DOMException.
        let webrtcObj;
        try {
            let ITEM_NAME = 'webrtc-stats-info';
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


                this.sendIntervalId = setInterval(async () => {
                    const response = [];
                    for (let stat of this.savedStats) {
                        response.push(stat);
                    }
                    this.savedStats = [];
                    // TODO: Add user info
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
    
    addConnectionToStats(pc, peerId, connectionId) {
        this.webrtcStats.addConnection({
            pc: pc,
            peerId: peerId,
            connectionId: connectionId
        })
    }
}

