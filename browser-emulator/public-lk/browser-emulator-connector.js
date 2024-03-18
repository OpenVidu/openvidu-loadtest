class BrowserEmulatorConnector {
    sendEvent(event, participant, session) {
        var ITEM_NAME = 'ov-events-config';
    
        const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));

        if(url) {
            return new Promise((resolve, reject) => {
                const eventObj = JSON.stringify(event);

                eventObj['participant'] = participant;
                eventObj['session'] = session;

                fetch(url.httpEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: eventObj
                })
                .then(response => {
                    if (response.ok) {
                        resolve();
                    } else {
                        reject(new Error('Request failed'));
                    }
                })
                .catch(error => reject(error));
            });
        }
    }
    
    sendError(err, participant, session) {
        var ITEM_NAME = 'ov-errorlog-config';
    
        const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));
        if (url) {
            const eventObj = JSON.stringify(err);

            eventObj['participant'] = participant;
            eventObj['session'] = session;
            fetch(url.httpEndpoint, {
                method: 'POST',
                body: eventObj,
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => {
                if (response.ok) {
                    console.log("Error sent to browser-emulator");
                } else {
                    console.error(response);
                }
            })
            .catch(error => console.error(error));
        } else {
            console.error("No URL in localStorage for error Endpoint");
        }
    }
}