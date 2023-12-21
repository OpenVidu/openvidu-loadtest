class BrowserEmulatorRecorder {
    constructor(localUserId, remoteUserId, sessionId, stream, browserEmulatorConnector) {
        this.stream = stream;
        this.recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm'
        });
        this.errors = 0;
        this.MAX_ERRORS = 5;
        this.BLOB_TIMESLICE = 5000;
        this.errorTiemout = null;
        this.ERROR_TIMEOUT = 500;
        this.beConnector = browserEmulatorConnector;
        this.localUserId = localUserId;
        this.remoteUserId = remoteUserId;
        this.sessionId = sessionId;
        this.unsentChunks = [];
        console.log("Local recorder initialized: " + this.localUserId + " recording " + this.remoteUserId);
    }

    start(delay) {
        if (delay === undefined) {
            delay = 5000;
        }

        recordStartDelay(delay).then(() => {
            this.recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    console.debug("Sending unsent chunks: " + this.localUserId + " recording " + this.remoteUserId + ". New chunk size: " + e.data.size/1024/1024 + " MB. Previous unsent chunks: " + this.unsentChunks.length);
                    this.unsentChunks.push(e.data);
                    const chunk = new Blob(this.unsentChunks, { type: this.recorder.mimeType });
                    this.sendBlob(chunk).then(() => {
                        console.debug("Chunk sent: " + this.localUserId + " recording " + this.remoteUserId);
                        this.unsentChunks = [];
                    }).catch((error) => {
                        console.error(error);
                        beConnector.sendError(error);
                        this.unsentChunks.push(chunk);
                    });
                }
            };
            this.recorder.onstart = () => {
                console.log("Recording started: " + this.localUserId + " recording " + this.remoteUserId);
            };

            this.recorder.onerror = (error) => {
                console.error("Error in recording: " + this.localUserId + " recording " + this.remoteUserId);
                this.errors += 1;
                if (!this.errorTiemout) {
                    let timeoutId = setTimeout(() => {
                        this.errors = 0;
                    }, this.ERROR_TIMEOUT)
                    this.errorTiemout = timeoutId;
                };
                console.error(error);
                beConnector.sendEvent({ event: "recordingerror", reason: error.error });
                if (this.errors <= this.MAX_ERRORS) {
                    // restart recording
                    console.info("Restarting recording: " + this.localUserId + " recording " + this.remoteUserId);
                    this.recorder.start(this.BLOB_TIMESLICE);
                } else {
                    console.error("Too many MediaRecorder errors in a short time, it will not be restarted (" + this.errors + "): " + this.localUserId + " recording " + this.remoteUserId);
                }
                try {
                    console.warn("Trying to print previous mediarecorder error")
                    console.error(error.error.message)
                    console.error(error.error.name)
                }  catch (error2) {
                    console.error(error2)
                    beConnector.sendEvent({ event: "recordingerror", connectionId: participant.sid, reason: error2 });
                }
            }
            this.recorder.start(this.BLOB_TIMESLICE);
        })
    }

    stop() {
        this.recorder.stop();
    }

    async sendBlob(blob) {
        return new Promise((resolve, reject) => {
            var ITEM_NAME = 'ov-qoe-config';

            const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));
            if (url) {
                const formData = new FormData();
                // Name of file: QOE_SESSIONID_THISUSERID_REMOTEUSERID.webm
                const finalSuffix = this.remoteUserId === this.localUserId ? this.remoteUserId + '_' + Math.floor(Math.random() * 1000000) : this.remoteUserId;
                const fileName = 'QOE_' + this.sessionId + '_' + this.localUserId + '_' + finalSuffix + '.webm';
                console.debug("Sending chunk: " + fileName);
                formData.append('file', blob, fileName);

                fetch(url.httpEndpoint, {
                    method: 'POST',
                    body: formData
                }).then(response => {
                    if (response.ok) {
                        resolve();
                    } else {
                        reject(new Error('Failed to send file'));
                    }
                }).catch(error => reject(error));
            } else {
                reject("No URL in localStorage for QoE Endpoint");
            }
        });
    }
}

class BrowserEmulatorRecorderManager {
    constructor(browserEmulatorConnector) {
        this.remoteControls = new Map();
        this.beConnector = browserEmulatorConnector;
    }

    createRecorder(localUserId, remoteUserId, sessionId, stream) {
        const ber = new BrowserEmulatorRecorder(localUserId, remoteUserId, sessionId, stream, this.beConnector);
        this.remoteControls.set(remoteUserId, ber);
        return ber;
    }

    async getRecordings() {
        const stopPromises = [];
        for (const remoteControlEntry of this.remoteControls.entries()) {
            const remoteUser = remoteControlEntry[0];
            const remoteControl = remoteControlEntry[1];
            const stopPromise = new Promise ((resolve, reject) => {
                console.log("Stopping recording: " + this.localUserId + " recording " + remoteUser);
                remoteControl.onstop = () => {
                    console.log("Recording stopped, getting blob: " + this.localUserId + " recording " + remoteUser);
                    // var chunks = recordingChunks.get(remoteUser);
                    // var blob = new Blob(chunks, { type: remoteControl.mimeType });
                    // recordingBlobs.set(remoteUser, blob);
                    // if (!!blob) {
                    //     console.log("Blob saved for " + this.localUserId + " recording " + remoteUser + ": " + blob.size/1024/1024 + " MB");
                    //     resolve({"user": remoteUser, "blob": blob});
                    // } else {
                    //     beConnector.sendError("Blob is null for: " + this.localUserId + " recording " + remoteUser);
                    //     reject("Blob is null for: " + this.localUserId + " recording " + remoteUser);
                    // }
                    resolve();
                };
                remoteControl.stop();
            })
            //.then((blobObject) => sendBlob(blobObject.blob, fileNamePrefix, blobObject.user))
            .catch((error) => {
                console.error(error);
                beConnector.sendError(error);
            })
            stopPromises.push(stopPromise);
        }
        return Promise.all(stopPromises);
    }
}