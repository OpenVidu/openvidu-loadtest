const RECORDING_MODE = Object.freeze({ALWAYS:'ALWAYS', MANUAL: 'MANUAL' });
const OUTPUT_MODE = Object.freeze({COMPOSED:'COMPOSED', INDIVIDUAL: 'INDIVIDUAL' });
const RECORDING_LAYOUT = Object.freeze({BEST_FIT:'BEST_FIT', CUSTOM: 'CUSTOM' });


var OPENVIDU_SERVER_URL;
var OPENVIDU_SERVER_SECRET;
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

var OV;
var session;
var mediaRecorderErrors = 0;

let beConnector;
var recordingManager
let webrtcStatsManager;

window.onload = () => {
	var url = new URL(window.location.href);
	OPENVIDU_SERVER_URL = url.searchParams.get("publicurl");
	OPENVIDU_SERVER_SECRET = url.searchParams.get("secret");
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

	const tokenCanBeCreated = !!USER_ID && !!SESSION_ID && !!OPENVIDU_SERVER_URL && !!OPENVIDU_SERVER_SECRET;
	const tokenHasBeenReceived = !!USER_ID && !!OPENVIDU_TOKEN;

	if(tokenCanBeCreated || tokenHasBeenReceived){
		showVideoRoom();
		joinSession();
	} else {
		initFormValues();
		showForm();
	}
};

function joinWithForm() {

	OPENVIDU_SERVER_URL = document.getElementById("form-publicurl").value;
	OPENVIDU_SERVER_SECRET = document.getElementById("form-secret").value;
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
	beConnector = new BrowserEmulatorConnector();
	recordingManager = new BrowserEmulatorRecorderManager(beConnector);
	webrtcStatsManager = new WebRTCStatsManager(beConnector);
	OV = new OpenVidu();
	OV.enableProdMode();
	session = OV.initSession();

	session.on("connectionCreated", event => {
		var connectionType = 'remote';
		if (event.connection.connectionId === session.connection.connectionId) {
			appendElement('local-connection-created');
			connectionType = 'local';
		}
		beConnector.sendEvent({ event: "connectionCreated", connectionId: event.connection.connectionId, connection: connectionType  }, USER_ID, SESSION_ID);

	});

	session.on("streamCreated", event => {
		beConnector.sendEvent({ event: "streamCreated", connectionId: event.stream.streamId,  connection: 'remote'}, USER_ID, SESSION_ID);

		var videoContainer = null;
		if(SHOW_VIDEO_ELEMENTS){
			const subscriberContainer = insertSubscriberContainer(event);

			videoContainer = 'remote-video-publisher';
		}
		
		const subscriber = session.subscribe(event.stream, videoContainer);

		subscriber.on("streamPlaying", e => {
			let remoteUser = JSON.parse(event.stream.connection.data).clientData.substring(13);
			webrtcStatsManager.addConnectionToStats(event.stream.getRTCPeerConnection(), remoteUser, event.stream.streamId);
			if (!!QOE_ANALYSIS) {
				console.log(USER_ID + " starting recording user " + remoteUser);
				var stream = event.stream.getMediaStream();
				const mediaRecorder = recordingManager.createRecorder(USER_ID, remoteUser, SESSION_ID, stream);
				mediaRecorder.start();
			}

			if(ROLE === 'SUBSCRIBER'){
				// It has been necessary mute the video because of the user gesture policies don't allow play it
				const videoId = e.target.videos[0].video.id;
				document.getElementById(videoId).muted = true;
				document.getElementById(videoId).play();
				createUnmuteButton('subscriber-need-to-be-unmuted', videoId);
			}
			beConnector.sendEvent({ event: "streamPlaying", connectionId: event.stream.streamId,  connection: 'remote'}, USER_ID, SESSION_ID);
		});
	});

	session.on("streamDestroyed", event => {
		beConnector.sendEvent({event: "streamDestroyed", connectionId: event.stream.streamId,  connection: 'remote'}, USER_ID, SESSION_ID);
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
				beConnector.sendError(err, USER_ID, SESSION_ID);
			});
		}
	});

	session.on("sessionDisconnected", event => {
		document.querySelectorAll('.video-remote-container').forEach(a => {
			a.remove();
		});
		beConnector.sendEvent({event: "sessionDisconnected", connectionId: session.connection.connectionId, reason: event.reason, connection: 'local' }, USER_ID, SESSION_ID);
	});

	session.on('exception', exception => {
		if (exception.name === 'ICE_CANDIDATE_ERROR') {
			beConnector.sendEvent({ event: "exception", connectionId: exception.origin.connection.connectionId, reason: exception.message }, USER_ID, SESSION_ID);
		}
	});

	if (!OPENVIDU_TOKEN) {
		console.log("Obtaining OpenVidu Token for session " + SESSION_ID + "...");
		OPENVIDU_TOKEN = await getToken();
	}

	beConnector.sendEvent({ event: "connectionStart" }, USER_ID, SESSION_ID);
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
							beConnector.sendError(err, USER_ID, SESSION_ID);
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
					publisher.on("streamPlaying", event => {
						webrtcStatsManager.addConnectionToStats(event.target.stream.getRTCPeerConnection(),
							USER_ID, event.target.stream.streamId);
					});
					session.publish(publisher);
					console.log("Publisher initialized");
					beConnector.sendEvent({ event: "connectedPublisher" }, USER_ID, SESSION_ID);
					setPublisherButtonsActions(publisher);
				}).catch((err) => {
					console.error(err);
					console.error(JSON.stringify(err));
					beConnector.sendError(err, USER_ID, SESSION_ID);
				})
			} else {
				console.log("User " + USER_ID + " is subscriber");
				initMainVideoThumbnail();

			}

		})
		.catch(error => {
			console.log("There was an error connecting to the session:", error.code, error.message);
			beConnector.sendError(error, USER_ID, SESSION_ID);
		});

}

function leaveSession() {
	session.disconnect();
	OV = null;
	session = null;
	OPENVIDU_TOKEN = null;
	OPENVIDU_SERVER_URL = null;
	OPENVIDU_SERVER_SECRET = null;
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

function createUnmuteButton(buttonId, videoId){
	const container = document.getElementById('remote');
	const button = document.createElement('button');
	button.innerText = 'Unmute';
	button.setAttribute('id', buttonId);
	button.onclick = () => {
		document.getElementById(videoId).muted = false;
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
			beConnector.sendEvent({ event: "accessAllowed", connectionId: '', connection: 'local' }, USER_ID, SESSION_ID);

		});
		publisher.once("streamCreated", e => {
			beConnector.sendEvent({ event: "streamCreated", connectionId: e.stream.streamId, connection: 'local' }, USER_ID, SESSION_ID);
			appendElement('local-stream-created');
		});
		publisher.once("streamPlaying", e => {
			beConnector.sendEvent({ event: "streamPlaying", connectionId: '', connection: 'local' }, USER_ID, SESSION_ID);
		});
		publisher.once("streamDestroyed", e => {
			beConnector.sendEvent({ event: "streamDestroyed", connectionId: e.stream.streamId, connection: 'local' }, USER_ID, SESSION_ID);

			if (e.reason !== 'unpublish') {
				document.getElementById('video-publisher').outerHTML = "";
			}
		});
	}


	document.getElementById('leave').onclick = () => {
		leaveSession();
	};
}

function insertSubscriberContainer(event) {

	var remotes = document.getElementById('remote-video-publisher');
	var videoContainer = document.createElement('div');
	videoContainer.id = 'video-' + event?.stream?.connection?.connectionId;
	remotes.appendChild(videoContainer);
	return videoContainer;
}

function initFormValues() {
	document.getElementById("form-publicurl").value = OPENVIDU_SERVER_URL;
	document.getElementById("form-secret").value = OPENVIDU_SERVER_SECRET;
	document.getElementById("form-sessionId").value = SESSION_ID;
	document.getElementById("form-userId").value = USER_ID;
	document.getElementById("form-showVideoElements").checked = SHOW_VIDEO_ELEMENTS;
	document.getElementById("form-resolution").value = RESOLUTION;
	document.getElementById("form-frameRate").value = FRAME_RATE;
}


function getToken() {
	return createSession(SESSION_ID).then(sessionId => createToken(sessionId)).catch(err => {
		console.error(err);
		beConnector.sendError(err, USER_ID, SESSION_ID);
	});
}

function createSession(sessionId) { // See https://docs.openvidu.io/en/stable/reference-docs/REST-API/#post-openviduapisessions
	return new Promise((resolve, reject) => {

		var properties = { customSessionId: sessionId };

		const recording = RECORDING_OUTPUT_MODE === OUTPUT_MODE.COMPOSED || RECORDING_OUTPUT_MODE === OUTPUT_MODE.INDIVIDUAL;
		if(recording){
			properties.defaultOutputMode = RECORDING_OUTPUT_MODE;
			properties.defaultRecordingLayout = RECORDING_LAYOUT.BEST_FIT;
			properties.recordingMode = RECORDING_MODE.ALWAYS;
		}
		$.ajax({
			type: "POST",
			url: OPENVIDU_SERVER_URL + "/openvidu/api/sessions",
			data: JSON.stringify(properties),
			headers: {
				"Authorization": "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SERVER_SECRET),
				"Content-Type": "application/json"
			},
			success: response => resolve(response.id),
			error: (error) => {
				if (error.status === 409) {
					resolve(sessionId);
				} else {
					console.warn('No connection to OpenVidu Server. This may be a certificate error at ' + OPENVIDU_SERVER_URL);
					if (window.confirm('No connection to OpenVidu Server. This may be a certificate error at \"' + OPENVIDU_SERVER_URL + '\"\n\nClick OK to navigate and accept it. ' +
						'If no certificate warning is shown, then check that your OpenVidu Server is up and running at "' + OPENVIDU_SERVER_URL + '"')) {
						location.assign(OPENVIDU_SERVER_URL + '/accept-certificate');
					}
				}
			}
		});
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
