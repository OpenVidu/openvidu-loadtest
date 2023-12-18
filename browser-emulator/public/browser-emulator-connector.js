class BrowserEmulatorConnector {
    sendEvent(event) {
        var ITEM_NAME = 'ov-events-config';
    
        const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));
    
        if(url) {
            return new Promise((resolve, reject) => {
                fetch(url.httpEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(event)
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
    
    sendError(err) {
        var ITEM_NAME = 'ov-errorlog-config';
    
        const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));
        if (url) {
            fetch(url.httpEndpoint, {
                method: 'POST',
                body: JSON.stringify(err),
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