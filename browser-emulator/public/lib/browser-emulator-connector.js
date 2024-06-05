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

    sendEvent(event, participant, session) {
        var ITEM_NAME = 'ov-events-config';

        this.getItem(ITEM_NAME).then((url) => {
            const urlObj = JSON.parse(url);
            let eventObj = event;
            if (typeof eventObj === 'object' && eventObj !== null) {
                eventObj['participant'] = participant;
                eventObj['session'] = session;
                eventObj['timestamp'] = new Date().toISOString();
                eventObj = JSON.stringify(eventObj);
            }

            return fetch(urlObj.httpEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: eventObj
            })
        }).then((response) => {
            if (response.ok) {
                console.log("Event sent to browser-emulator");
            } else {
                console.error(response);
            }
        }).catch((error) => {
            console.error(error);
        });
    }

    sendError(err, participant, session) {
        var ITEM_NAME = 'ov-errorlog-config';

        this.getItem(ITEM_NAME).then((url) => {
            const urlObj = JSON.parse(url);
            let eventObj = err;
            if (typeof eventObj === 'object' && eventObj !== null) {
                eventObj['participant'] = participant;
                eventObj['session'] = session;
                eventObj['timestamp'] = new Date().toISOString();
                eventObj = JSON.stringify(eventObj);
            }

            return fetch(urlObj.httpEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: eventObj
            })
        }).then((response) => {
            if (response.ok) {
                console.log("Error sent to browser-emulator");
            } else {
                console.error(response);
            }
        }).catch((error) => {
            console.error(error);
        });
    }
}