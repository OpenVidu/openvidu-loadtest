const RECORDING_MODE = Object.freeze({ALWAYS:'ALWAYS', MANUAL: 'MANUAL' });
const OUTPUT_MODE = Object.freeze({COMPOSED:'COMPOSED', INDIVIDUAL: 'INDIVIDUAL' });
const RECORDING_LAYOUT = Object.freeze({BEST_FIT:'BEST_FIT', CUSTOM: 'CUSTOM' });


var OPENVIDU_SERVER_URL;
var OPENVIDU_TOKEN;
var SESSION_ID;
var USER_ID;
var AUDIO;
var VIDEO;
var SHOW_VIDEO_ELEMENTS;
var RESOLUTION;
var ROLE;
var RECORDING_OUTPUT_MODE;
var FRAME_RATE;
var QOE_ANALYSIS;

var session;
var mediaRecorderErrors = 0;
var LivekitClient = window.LivekitClient;
var trackUser = new Map();

// var subscriptions = 0;
// const MAX_SUBSCRIPTIONS = 5;

var remoteControls = new Map();
var recordingBlobs = new Map();
var recordingChunks = new Map();

window.onload = () => {
	var url = new URL(window.location.href);
	OPENVIDU_SERVER_URL = url.searchParams.get("publicurl");
	OPENVIDU_TOKEN = url.searchParams.get("token");
	SESSION_ID = url.searchParams.get("sessionId");
	USER_ID = url.searchParams.get("userId");
	AUDIO = url.searchParams.get("audio") === 'true';
	VIDEO = url.searchParams.get("video") === 'true';
	RESOLUTION = url.searchParams.get("resolution");
	ROLE = url.searchParams.get("role");
	RECORDING_OUTPUT_MODE = url.searchParams.get("recordingmode");
	FRAME_RATE = url.searchParams.get("frameRate");
	QOE_ANALYSIS = url.searchParams.get("qoeAnalysis");
	SHOW_VIDEO_ELEMENTS = url.searchParams.get("showVideoElements") === 'true';

	const userCond = !!USER_ID && !!SESSION_ID && !!OPENVIDU_SERVER_URL;
	const token = !!OPENVIDU_TOKEN;

	if(userCond && token){
		showVideoRoom();
		joinSession();
	} else {
		initFormValues();
		showForm();
	}
};

function joinWithForm() {

	OPENVIDU_SERVER_URL = document.getElementById("form-publicurl").value;
	OPENVIDU_TOKEN = document.getElementById("form-token").value;
	SESSION_ID = document.getElementById("form-sessionId").value;
	USER_ID = document.getElementById("form-userId").value;
	RESOLUTION = document.getElementById("form-resolution").value;
	FRAME_RATE = document.getElementById("form-frameRate").value;
	SHOW_VIDEO_ELEMENTS = document.getElementById("form-showVideoElements").checked;
	ROLE = document.getElementById("form-role-subscriber").checked ? 'SUBSCRIBER' :  'PUBLISHER';
	AUDIO = true;
	VIDEO = true;

	showVideoRoom();
	joinSession();
	return false;
}

function appendElement(id) {
    var eventsDiv = document.getElementById('openvidu-events');
    var element = document.createElement('div');
    element.setAttribute("id", id);
    eventsDiv.appendChild(element);
}

function recordStartDelay(time) {
	return new Promise(resolve => setTimeout(resolve, time));
}

async function joinSession() {
	console.log("Joining session " + SESSION_ID + "...");
	session = new LivekitClient.Room();
	//session.prepareConnection(OPENVIDU_SERVER_URL, OPENVIDU_TOKEN);
	var room = session;
	//OV.enableProdMode();

	room.on(LivekitClient.RoomEvent.Connected, () => {
		appendElement('local-connection-created');
		sendEvent({ event: "connectionCreated" });

	});

	room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
		sendEvent({ event: "streamCreated", connectionId: participant.sid,  connection: 'remote' });
		if (SHOW_VIDEO_ELEMENTS) {
			const element = track.attach();
			const videoContainer = insertSubscriberTrack(element, participant.sid);
			if (track.kind === LivekitClient.Track.Kind.Audio) {
				createUnmuteButton('subscriber-need-to-be-unmuted', element);
			}
		}

		if (!!QOE_ANALYSIS) {
			// var remoteControl = new ElasTestRemoteControl();
			// remoteControl.startRecording(event.stream.getMediaStream(), FRAME_RATE, RESOLUTION);
			var remoteUser = participant.identity;
			if (!trackUser.has(participant.sid)) {
				trackUser.set(participant.sid, track);
			} else {
				console.log(USER_ID + " starting recording user " + remoteUser);
				var stream = new MediaStream([trackUser.get(participant.sid).mediaStreamTrack, track.mediaStreamTrack]);
				const mediaRecorder = new MediaRecorder(stream, { 
					mimeType: 'video/webm' 
				});
				console.log("Local recorder initialized: " + USER_ID + " recording " + remoteUser);
				recordStartDelay(5000).then(() => {
					recordingChunks.set(remoteUser, []);
					mediaRecorder.ondataavailable = (e) => {
						if (e.data.size > 0) {
							recordingChunks.get(remoteUser).push(e.data);
						}
					};
					mediaRecorder.onstart = () => {
						console.log("Recording started: " + USER_ID + " recording " + remoteUser);
						remoteControls.set(remoteUser, mediaRecorder);
					};
					mediaRecorder.onerror = (error) => {
						console.error("Error in recording: " + USER_ID + " recording " + remoteUser);
						mediaRecorderErrors++;
						console.error(error)
						sendEvent({ event: "recordingerror", connectionId: participant.sid, reason: error.error });
						if (mediaRecorderErrors <= 5) {
							// restart recording
							console.info("Restarting recording: " + USER_ID + " recording " + remoteUser);
							remoteControls.get(remoteUser).start();
						} else {
							console.info("Too many MediaRecorder errors, trying to save blob: " + USER_ID + " recording " + remoteUser);
							var remoteControl = remoteControls.get(remoteUser);
							if (!!remoteControl) {
								var chunks = recordingChunks.get(remoteUser);
								var blob = new Blob(chunks, { type: remoteControl.mimeType });
								recordingBlobs.set(remoteUser, blob);
								if (!!blob) {
									console.log("Blob saved for " + USER_ID + " recording " + remoteUser + ": " + blob.size/1024/1024 + " MB");
									sendBlob(blob, "QOE_errored_recording", remoteUser)
								} else {
									sendError("Blob is null for: " + USER_ID + " recording " + remoteUser);
									reject("Blob is null for: " + USER_ID + " recording " + remoteUser);
								}
							}
						}
						try {
							console.warn("Trying to print previous mediarecorder error")
							console.error(error.error.message)
							console.error(error.error.name)
						}  catch (error2) {
							console.error(error2)
							sendEvent({ event: "recordingerror", connectionId: participant.sid, reason: error2 });
						}
					}
					mediaRecorder.start()
				})
			}

		}
	});

	room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
		sendEvent({event: "streamDestroyed", connectionId: participant.sid,  connection: 'remote'});
		track.detach();
		if (!!QOE_ANALYSIS) {
			var remoteUser = participant.identity;
			var remoteControl = remoteControls.get(remoteUser);
			remoteControl.stop().then(() => {
				console.log("Recording stopped because of streamDestroyed");
				return remoteControl.getBlob()
			}).then((blob) => {
				recordingBlobs.set(remoteUser, blob);
				console.log("Blob created");
			}).catch(err => {
				console.error(err);
				sendError(err);
			});
		}
	});

	room.on(LivekitClient.RoomEvent.Disconnected, () => {
		document.querySelectorAll('.video-remote-container').forEach(a => {
			a.remove();
		});
		sendEvent({event: "sessionDisconnected", connection: 'local' });
	});

	room.on(LivekitClient.RoomEvent.MediaDevicesError, error => {
		sendEvent({ event: "exception", reason: error.message });
	});

	room.on(LivekitClient.RoomEvent.LocalTrackPublished, (localTrackPublication, localParticipant) => {
		sendEvent({ event: "streamCreated", connectionId: localParticipant.sid, connection: 'local' });
		if (SHOW_VIDEO_ELEMENTS) {
			const element = localTrackPublication.track.attach();
			document.getElementById('video-publisher').appendChild(element);
		}
		appendElement('local-stream-created');
	});

	room.on(LivekitClient.RoomEvent.LocalTrackUnpublished, (localTrackPublication, localParticipant) => {
		sendEvent({ event: "streamDestroyed", connectionId: localParticipant.sid, connection: 'local' });
		localTrackPublication.track.detach();
		document.getElementById('video-publisher').outerHTML = "";
	});

	var resSplit = RESOLUTION.split('x');
	var width = resSplit[0];
	var height = resSplit[1];
	var roomOptions = {
		adaptiveStream: false,
		publishDefaults: {
			simulcast: false,
			videoEncoding: {
				maxFramerate: FRAME_RATE
			}
		}
	}
	if (AUDIO) {
		roomOptions.audioCaptureDefaults = {
			autoGainControl: false,
			echoCancellation: false,
			noiseSuppression: false,
		}
	}
	if (VIDEO) {
		roomOptions.videoCaptureDefaults = {
			resolution: {
				frameRate: FRAME_RATE,
				width,
				height
			}
		}
	
	}
	room.connect(OPENVIDU_SERVER_URL, OPENVIDU_TOKEN, roomOptions)
		.then(async () => {
			console.log("Connected to session " + SESSION_ID);
			if (ROLE === 'PUBLISHER') {
				console.log("User " + USER_ID + " is publisher, publishing video and audio...");
				try {
					await room.localParticipant.enableCameraAndMicrophone();
					console.log("Publisher initialized");
					setPublisherButtonsActions(room);
				} catch (err) {
					console.error(err);
					console.error(JSON.stringify(err));
					sendError(err);
				}
			} else {
				console.log("User " + USER_ID + " is subscriber");
				initMainVideoThumbnail();

			}

		})
		.catch(error => {
			console.log("There was an error connecting to the session:", error.code, error.message);
			sendError(error);
		});

}

function leaveSession() {
	session.disconnect();
	session = null;
	OPENVIDU_TOKEN = null;
	OPENVIDU_SERVER_URL = null;
	OPENVIDU_TOKEN = null;
	SESSION_ID = null;
	USER_ID = null;
	AUDIO = null;
	VIDEO = null;
	SHOW_VIDEO_ELEMENTS = null;
	RESOLUTION = null;
	ROLE = null;
	RECORDING_OUTPUT_MODE = null;
	FRAME_RATE = null;
	window.location.href = window.location.origin;
	showForm();
}

window.onbeforeunload = () => {
	if (session) leaveSession();
};

function initMainVideoThumbnail() {
	var container = document.getElementById('video-publisher');
	var thumbnail = document.getElementById('subscriberThumbnail');
	if(!thumbnail) {
		var element = document.createElement('div');
		element.setAttribute("id", 'subscriberThumbnail');
		container.appendChild(element);
		element.style.width =  '320px';
		element.style.height = '240px';
		element.style.background = "url('images/subscriber-msg.jpg') round";
	}
}

function createUnmuteButton(buttonId, videoContainer){
	videoContainer.muted = true;
	const container = document.getElementById('remote');
	const button = document.createElement('button');
	button.innerText = 'Unmute';
	button.setAttribute('id', buttonId);
	button.onclick = () => {
		videoContainer.muted = false;
		button.remove();
	};
	container.appendChild(button);
}

function setPublisherButtonsActions(room) {
	var publisher = room.localParticipant;
	if(ROLE === 'PUBLISHER'){
		document.getElementById('mute').onclick = (event) => {
			var isMuted = event.target.innerText === 'Unmute';
			Promise.all([
				publisher.setCameraEnabled(!isMuted),
				publisher.setMicrophoneEnabled(!isMuted)
			]).then(() => {
				event.target.innerText = isMuted ? 'Mute' : 'Unmute';
			}).catch(err => {
				console.error(err);
			})
		}
		document.getElementById('unpublish').onclick = (event) => {
			if (event.target.innerText === 'Unpublish') {
				publisher.unpublishTracks(publisher.tracks);
				event.target.innerText = 'Publish';
			} else {
				var elem = document.getElementById('video-publisher');
				elem.parentNode.removeChild(elem);

				var videoContainer = null;
				if(SHOW_VIDEO_ELEMENTS){
					videoContainer = 'video-publisher';
				}
				var publisher2 = OV.initPublisher(videoContainer, {
					 resolution: RESOLUTION,
					 frameRate: 30,
					 mirror: false
				});
				setPublisherButtonsActions(publisher2);
				session.publish(publisher2);
				event.target.innerText = 'Unpublish';
			}
		}
	}


	document.getElementById('leave').onclick = () => {
		leaveSession();
	};
}

function createOrGetVideoContainer(participantSid) {
	var videoContainer = document.getElementById('video-' + participantSid);
	if (videoContainer === null) {
		var remotes = document.getElementById('remote-video-publisher');
		videoContainer = document.createElement('div');
		videoContainer.id = 'video-' + participantSid;
		remotes.appendChild(videoContainer);
	}
	return videoContainer;
}

function insertSubscriberTrack(element, participantSid) {
	var videoContainer = createOrGetVideoContainer(participantSid);
	videoContainer.appendChild(element);
	return videoContainer;
}

function initFormValues() {
	document.getElementById("form-publicurl").value = OPENVIDU_SERVER_URL;
	document.getElementById("form-sessionId").value = SESSION_ID;
	document.getElementById("form-userId").value = USER_ID;
	document.getElementById("form-showVideoElements").checked = SHOW_VIDEO_ELEMENTS;
	document.getElementById("form-resolution").value = RESOLUTION;
	document.getElementById("form-frameRate").value = FRAME_RATE;
}

function sendEvent(event) {
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

function showForm() {
	document.getElementById('join-form').style.display = 'block';
	document.getElementById('local').style.display = 'none';
	document.getElementById('remote').style.display = 'none';
}

function showVideoRoom() {
	document.getElementById('join-form').style.display = 'none';
	document.getElementById('local').style.display = 'block';
	document.getElementById('remote').style.display = 'block';
}

async function getRecordings(fileNamePrefix) {
	const stopPromises = [];
	for (const remoteControlEntry of remoteControls.entries()) {
		const remoteUser = remoteControlEntry[0];
		const remoteControl = remoteControlEntry[1];
		const stopPromise = new Promise ((resolve, reject) => {
			console.log("Stopping recording: " + USER_ID + " recording " + remoteUser);
			remoteControl.onstop = () => {
				console.log("Recording stopped, getting blob: " + USER_ID + " recording " + remoteUser);
				var chunks = recordingChunks.get(remoteUser);
				var blob = new Blob(chunks, { type: remoteControl.mimeType });
				recordingBlobs.set(remoteUser, blob);
				if (!!blob) {
					console.log("Blob saved for " + USER_ID + " recording " + remoteUser + ": " + blob.size/1024/1024 + " MB");
					resolve({"user": remoteUser, "blob": blob});
				} else {
					sendError("Blob is null for: " + USER_ID + " recording " + remoteUser);
					reject("Blob is null for: " + USER_ID + " recording " + remoteUser);
				}
			};
			remoteControl.stop();
		}).then((blobObject) => sendBlob(blobObject.blob, fileNamePrefix, blobObject.user)).catch((error) => {
			console.error(error);
			sendError(error);
		})
		stopPromises.push(stopPromise);
	}
	try {
		session.disconnect();
	} catch (error) {
		console.error("Can't disconnect from session")
		console.error(error)
	}
	return Promise.all(stopPromises);
}

async function sendBlob(blob, fileNamePrefix, remoteUserId) {
	return new Promise((resolve, reject) => {
		var ITEM_NAME = 'ov-qoe-config';

		const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));
		if (url) {
			const formData = new FormData();
			// Name of file: QOE_SESSIONID_THISUSERID_REMOTEUSERID.webm
			const finalSuffix = remoteUserId === USER_ID ? remoteUserId + '_' + Math.floor(Math.random() * 1000000) : remoteUserId;
			const fileName = fileNamePrefix + '_' + SESSION_ID + '_' + USER_ID + '_' + finalSuffix + '.webm';
			console.log("Sending file: " + fileName);
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
			})
			.catch(error => reject(error));
		} else {
			reject("No URL in localStorage for QoE Endpoint");
		}
	});
}

function sendError(err) {
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
		reject("No URL in localStorage for error Endpoint");
	}
}