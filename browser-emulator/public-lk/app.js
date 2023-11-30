const RECORDING_MODE = Object.freeze({ALWAYS:'ALWAYS', MANUAL: 'MANUAL' });
const OUTPUT_MODE = Object.freeze({COMPOSED:'COMPOSED', INDIVIDUAL: 'INDIVIDUAL' });
const RECORDING_LAYOUT = Object.freeze({BEST_FIT:'BEST_FIT', CUSTOM: 'CUSTOM' });


var OPENVIDU_SERVER_URL;
var LIVEKIT_API_KEY;
var LIVEKIT_API_SECRET;
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
	LIVEKIT_API_KEY = url.searchParams.get("livekitapikey");
	LIVEKIT_API_SECRET = url.searchParams.get("livekitapisecret");
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
	const lkApiCond = !!LIVEKIT_API_KEY && !!LIVEKIT_API_SECRET;
	const token = !!OPENVIDU_TOKEN;

	if(userCond && lkApiCond && token){
		showVideoRoom();
		joinSession();
	} else {
		initFormValues();
		showForm();
	}
};

function joinWithForm() {

	OPENVIDU_SERVER_URL = document.getElementById("form-publicurl").value;
	LIVEKIT_API_KEY = document.getElementById("form-apikey").value;
	LIVEKIT_API_SECRET = document.getElementById("form-secret").value;
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
	//OV.enableProdMode();
	room.on(LivekitClient.RoomEvent.Connected, () => {
		appendElement('local-connection-created');
		sendEvent({ event: "connectionCreated" });

	});
	room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
		sendEvent({ event: "streamCreated", connectionId: participant.sid,  connection: 'remote' });

		const element = track.attach();
		if (SHOW_VIDEO_ELEMENTS) {
			insertSubscriberContainer(track, element, participant.sid);
		}

		if (!!QOE_ANALYSIS) {
			// var remoteControl = new ElasTestRemoteControl();
			// remoteControl.startRecording(event.stream.getMediaStream(), FRAME_RATE, RESOLUTION);
			var remoteUser = participant.name;
			if (!trackUser.has(participant.sid)) {
				trackUser.set(participant.sid, track);
			} else {
				console.log(USER_ID + " starting recording user " + remoteUser);
				var tracks = [trackUser.get(participant.sid).mediaStreamTrack, track.mediaStreamTrack];
				const mediaRecorder = new MediaRecorder(tracks, { 
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
		// TODO
	});

	session.on("streamDestroyed", event => {
		sendEvent({event: "streamDestroyed", connectionId: event.stream.streamId,  connection: 'remote'});
		if (!!QOE_ANALYSIS) {
			var remoteUser = JSON.parse(event.stream.connection.data).clientData.substring(13);
			var remoteControl = remoteControls.get(remoteUser);
			remoteControl.stop().then(() => {
				console.log("Recording stopped because of streamDestroyed");
				return remoteControl.getBlob()
			}).then((blob) => {
				var remoteUser = JSON.parse(event.stream.connection.data).clientData.substring(13);
				recordingBlobs.set(remoteUser, blob);
				console.log("Blob created");
			}).catch(err => {
				console.error(err);
				sendError(err);
			});
		}
	});

	session.on("sessionDisconnected", event => {
		document.querySelectorAll('.video-remote-container').forEach(a => {
			a.remove();
		});
		sendEvent({event: "sessionDisconnected", connectionId: session.connection.connectionId, reason: event.reason, connection: 'local' });
	});

	session.on('exception', exception => {
		if (exception.name === 'ICE_CANDIDATE_ERROR') {
			sendEvent({ event: "exception", connectionId: exception.origin.connection.connectionId, reason: exception.message });
		}
	});

	if (!OPENVIDU_TOKEN) {
		console.log("Obtaining OpenVidu Token for session " + SESSION_ID + "...");
		OPENVIDU_TOKEN = await getToken();
	}

	session.connect(OPENVIDU_TOKEN, {clientData: `Real_browser_${USER_ID}`})
		.then(async () => {
			console.log("Connected to session " + SESSION_ID);
			if(ROLE === 'PUBLISHER') {
				var videoContainer = null;
				if(SHOW_VIDEO_ELEMENTS){
					videoContainer = 'video-publisher';
				}
				console.log("User " + USER_ID + " is publisher, publishing video and audio...");
				var audioSource = AUDIO ? undefined : null;
				var videoSource = VIDEO ? undefined : null;
				OV.getUserMedia({
					audioSource,
					videoSource,
					publishAudio: AUDIO,
					publishVideo: VIDEO,
					resolution:  RESOLUTION,
					frameRate: FRAME_RATE,
					mirror: false
				}).then((mediaStream) => {
					if (AUDIO) {
						var audioTrack = mediaStream.getAudioTracks()[0];
						return audioTrack.applyConstraints({
							echoCancellation: false,
							noiseSuppression: false,
							autoGainControl: false,
						}).then(() => {
							return audioTrack;
						}).catch(err => {
							console.error(err);
							sendError(err);
						});
					} else {
						return null;
					}
				}).then((audioTrack) => {
					const publisher = OV.initPublisher(videoContainer, {
						audioSource: audioTrack,
						videoSource: videoSource,
						publishAudio: AUDIO,
						publishVideo: VIDEO,
						resolution:  RESOLUTION,
						frameRate: FRAME_RATE,
						mirror: false
					});
					session.publish(publisher);
					console.log("Publisher initialized");
					setPublisherButtonsActions(publisher);
				}).catch((err) => {
					console.error(err);
					console.error(JSON.stringify(err));
					sendError(err);
				})
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
	LIVEKIT_API_KEY = null;
	LIVEKIT_API_SECRET = null;
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

function setPublisherButtonsActions(publisher) {
	if(ROLE === 'PUBLISHER'){
		document.getElementById('mute').onclick = (e) => {
			event.target.innerText = event.target.innerText === 'Mute' ? 'Unmute' : 'Mute';
			publisher.publishAudio(!publisher.stream.audioActive);
			publisher.publishVideo(!publisher.stream.videoActive);
		}
		document.getElementById('unpublish').onclick = () => {
			if (event.target.innerText === 'Unpublish') {
				session.unpublish(publisher);
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

		publisher.once("accessAllowed", e => {
			sendEvent({ event: "accessAllowed", connectionId: '', connection: 'local' });

		});
		publisher.once("streamCreated", e => {
			sendEvent({ event: "streamCreated", connectionId: e.stream.streamId, connection: 'local' });
			appendElement('local-stream-created');
		});
		publisher.once("streamPlaying", e => {
			sendEvent({ event: "streamPlaying", connectionId: '', connection: 'local' });
		});
		publisher.once("streamDestroyed", e => {
			sendEvent({ event: "streamDestroyed", connectionId: e.stream.streamId, connection: 'local' });

			if (e.reason !== 'unpublish') {
				document.getElementById('video-publisher').outerHTML = "";
			}
		});
	}


	document.getElementById('leave').onclick = () => {
		leaveSession();
	};
}

function insertSubscriberContainer(track, element, participantSid) {

	var remotes = document.getElementById('remote-video-publisher');
	var videoContainer = document.createElement('div');
	videoContainer.id = 'video-' + participantSid;
	remotes.appendChild(videoContainer);
	videoContainer.appendChild(element);
	
	videoContainer.muted = true;
	videoContainer.play();
	createUnmuteButton('subscriber-need-to-be-unmuted', videoContainer);
	return videoContainer;
}

function initFormValues() {
	document.getElementById("form-publicurl").value = OPENVIDU_SERVER_URL;
	document.getElementById("form-apikey").value = LIVEKIT_API_KEY;
	document.getElementById("form-secret").value = LIVEKIT_API_SECRET;
	document.getElementById("form-sessionId").value = SESSION_ID;
	document.getElementById("form-userId").value = USER_ID;
	document.getElementById("form-showVideoElements").checked = SHOW_VIDEO_ELEMENTS;
	document.getElementById("form-resolution").value = RESOLUTION;
	document.getElementById("form-frameRate").value = FRAME_RATE;
}


function getToken() {
	return createSession(SESSION_ID).then(sessionId => createToken(sessionId)).catch(err => {
		console.error(err);
		sendError(err);
	});
}

function createSession(sessionId) {
	return new Promise((resolve, reject) => {

		var properties = { customSessionId: sessionId };

		const recording = RECORDING_OUTPUT_MODE === OUTPUT_MODE.COMPOSED || RECORDING_OUTPUT_MODE === OUTPUT_MODE.INDIVIDUAL;
		if(recording){
			properties.defaultOutputMode = RECORDING_OUTPUT_MODE;
			properties.defaultRecordingLayout = RECORDING_LAYOUT.BEST_FIT;
			properties.recordingMode = RECORDING_MODE.ALWAYS;
		}
		const requestOptions = {
			method: 'POST',
			headers: {
				"Authorization": "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SERVER_SECRET),
				"Content-Type": "application/json"
			},
			body: JSON.stringify(properties)
		}
		
		fetch(OPENVIDU_SERVER_URL + "/openvidu/api/sessions", requestOptions)
		.then(response => {
			if (!response.ok) {
				if (response.status === 409) {
					resolve(sessionId);
				} else {
					console.warn('No connection to OpenVidu Server. This may be a certificate error at ' + OPENVIDU_SERVER_URL);
					if (window.confirm('No connection to OpenVidu Server. This may be a certificate error at \"' + OPENVIDU_SERVER_URL + '\"\n\nClick OK to navigate and accept it. ' +
						'If no certificate warning is shown, then check that your OpenVidu Server is up and running at "' + OPENVIDU_SERVER_URL + '"')) {
						location.assign(OPENVIDU_SERVER_URL + '/accept-certificate');
					}
				}
			}
			return response.json();
		}).then(response => resolve(response.id))
	});
}

function createToken(sessionId) { // See https://docs.openvidu.io/en/stable/reference-docs/REST-API/#post-openviduapisessionsltsession_idgtconnection
    return new Promise((resolve, reject) => {
        $.ajax({
            type: 'POST',
            url: OPENVIDU_SERVER_URL + '/openvidu/api/sessions/' + sessionId + '/connection',
            data: JSON.stringify({role: ROLE}),
            headers: {
                'Authorization': 'Basic ' + btoa('OPENVIDUAPP:' + OPENVIDU_SERVER_SECRET),
                'Content-Type': 'application/json',
            },
            success: (response) => resolve(response.token),
            error: (error) => reject(error)
        });
    });
}

function sendEvent(event) {
	var ITEM_NAME = 'ov-events-config';

	const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));

	if(url) {
		return new Promise((resolve, reject) => {
			$.ajax({
				type: 'POST',
				url: url.httpEndpoint,
				data: JSON.stringify(event),
				headers: {
					'Content-Type': 'application/json',
				},
				success: (response) => resolve(),
				error: (error) => reject(error)
			});
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
	return new Promise ((resolve, reject) => {
		var ITEM_NAME = 'ov-qoe-config';

		const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));
		if (url) {
			const formData = new FormData();
			// Name of file: QOE_SESSIONID_THISUSERID_REMOTEUSERID.webm
			const finalSuffix = remoteUserId === USER_ID ? remoteUserId + '_' + Math.floor(Math.random() * 1000000) : remoteUserId;
			const fileName = fileNamePrefix + '_' + SESSION_ID + '_' + USER_ID + '_' + finalSuffix + '.webm';
			console.log("Sending file: " + fileName);
			formData.append('file', blob, fileName);
			$.ajax({
				type: 'POST',
				url: url.httpEndpoint,
				data: formData,
				processData: false,
				contentType: false,
				success: (response) => resolve(),
				error: (error) => reject(error)
			});
		} else {
			reject("No URL in localStorage for QoE Endpoint")
		}
	})
}

function sendError(err) {
	var ITEM_NAME = 'ov-errorlog-config';

	const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));
	if (url) {
		$.ajax({
			type: 'POST',
			url: url.httpEndpoint,
			data: JSON.stringify(err),
			success: (response) => console.log("Error sent to browser-emulator"),
			error: (error) => console.error(error)
		});
	} else {
		reject("No URL in localStorage for error Endpoint")
	}
}