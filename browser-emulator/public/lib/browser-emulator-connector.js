class BrowserEmulatorConnector {
    async getItem(itemName) {
        try {
            let webrtcObj = localStorage.getItem(itemName);
            const maxRetries = 5;
            const retryCount = 0;
            const backoffTime = 1000 + Math.floor(Math.random() * 2000);

            while (!webrtcObj && retryCount < maxRetries) {
                console.warn("BrowserEmulatorConnector item with name" + itemName + " not found in localStorage, retrying in " + backoffTime + "ms...");
                await new Promise((resolve) => setTimeout(resolve, backoffTime));
                webrtcObj = localStorage.getItem(itemName);
            }

            if (!webrtcObj) {
                throw new Error("BrowserEmulatorConnector item with name" + itemName + " not found in localStorage after multiple retries, stats won't be sent.");
            }

            return webrtcObj;
        }
        catch (e) {
            console.warn("BrowserEmulatorConnector item with name" + itemName + " not accessible in this context, stats won't be sent.");
        }
    }

    async sendEvent(event, participant, session) {
        let ITEM_NAME = 'ov-events-config';
        let timestamp = new Date().toISOString();
        try {
            const url = JSON.parse(await this.getItem(ITEM_NAME));
            let eventObj = event;
            if (typeof eventObj === 'object' && eventObj !== null) {
                eventObj['participant'] = participant;
                eventObj['session'] = session;
                eventObj['timestamp'] = timestamp;
                eventObj = JSON.stringify(eventObj);
            }

            const response = await fetch(url.httpEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: eventObj
            });

            if (response.ok) {
                console.log("Event sent to browser-emulator");
            } else {
                console.error(response);
            }
        } catch (error) {
            console.error(error);
        }
    }

    async sendError(err, participant, session) {
        let ITEM_NAME = 'ov-errorlog-config';
        let timestamp = new Date().toISOString();
        try {
            const url = JSON.parse(await this.getItem(ITEM_NAME));
            let eventObj = err;
            if (typeof eventObj === 'object' && eventObj !== null) {
                eventObj['participant'] = participant;
                eventObj['session'] = session;
                eventObj['timestamp'] = timestamp;
                eventObj = JSON.stringify(eventObj);
            }

            const response = await fetch(url.httpEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: eventObj
            });

            if (response.ok) {
                console.log("Error sent to browser-emulator");
            } else {
                console.error(response);
            }
        } catch (error) {
            console.error(error);
        }
    }
}