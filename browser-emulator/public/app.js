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

var subscriptions = 0;
const MAX_SUBSCRIPTIONS = 5;

var remoteControls = new Map();
var recordingBlobs = new Map();

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

function calculateBitsPerSecond(frameRate, resolution) {
	var splitted = resolution.split("x");
	var width = parseInt(splitted[0]);
	var height = parseInt(splitted[1]);
	var bitsPerPixel = 24;
	return frameRate * width * height * bitsPerPixel;
}

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

async function joinSession() {
	OV = new OpenVidu();
	OV.enableProdMode();
	session = OV.initSession();

	session.on("connectionCreated", event => {
		var connectionType = 'remote';
		if (event.connection.connectionId === session.connection.connectionId) {
			appendElement('local-connection-created');
			connectionType = 'local';
		}
		sendEvent({ event: "connectionCreated", connectionId: event.connection.connectionId, connection: connectionType  });

	});

	session.on("streamCreated", event => {
		sendEvent({ event: "streamCreated", connectionId: event.stream.streamId,  connection: 'remote'});

		var videoContainer = null;
		if(SHOW_VIDEO_ELEMENTS && subscriptions < MAX_SUBSCRIPTIONS){
			const subscriberContainer = insertSubscriberContainer(event);

			videoContainer = 'remote-video-publisher';
		}

		subscriptions +=1;
		const subscriber = session.subscribe(event.stream, videoContainer);

		subscriber.on("streamPlaying", e => {


			if(ROLE === 'SUBSCRIBER'){
				// It has been necessary mute the video because of the user gesture policies don't allow play it
				const videoId = e.target.videos[0].video.id;
				document.getElementById(videoId).muted = true;
				document.getElementById(videoId).play();
				createUnmuteButton('subscriber-need-to-be-unmuted', videoId);
			}
				
			if (!!QOE_ANALYSIS) {
				// var remoteControl = new ElasTestRemoteControl();
				// remoteControl.startRecording(event.stream.getMediaStream(), FRAME_RATE, RESOLUTION);
				var remoteUser = JSON.parse(event.stream.connection.data).clientData.substring(13);
				var remoteControl = OV.initLocalRecorder(event.stream);
				while(remoteControl.state != "READY") {
				}
				remoteControl.record({
					mimeType : "video/webm",
					audioBitsPerSecond : 48000,
					videoBitsPerSecond: calculateBitsPerSecond(FRAME_RATE, RESOLUTION),
				}).then(() => {
					remoteControls.set(remoteUser, remoteControl);
				})
			}

			sendEvent({ event: "streamPlaying", connectionId: event.stream.streamId,  connection: 'remote'});
		});
	});

	session.on("streamDestroyed", event => {
		sendEvent({event: "streamDestroyed", connectionId: event.stream.streamId,  connection: 'remote'});
		if (!!QOE_ANALYSIS) {
			var remoteControl = remoteControls.get(event.stream.streamId);
			remoteControl.stop().then(() => {
				console.log("Recording stopped because of streamDestroyed");
				return remoteControl.getBlob()
			}).then((blob) => {
				var remoteUser = JSON.parse(event.stream.connection.data).clientData.substring(13);
				recordingBlobs.set(remoteUser, blob);
				console.log("Blob created");
			})
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
		OPENVIDU_TOKEN = await getToken();
	}

	session.connect(OPENVIDU_TOKEN, {clientData: `Real_browser_${USER_ID}`})
		.then(() => {

			if(ROLE === 'PUBLISHER') {
				var videoContainer = null;
				if(SHOW_VIDEO_ELEMENTS){
					videoContainer = 'video-publisher';
				}

				var publisher = OV.initPublisher(videoContainer, {
					audioSource: AUDIO ? undefined : null,
					videoSource: VIDEO ? undefined : null,
					publishAudio: AUDIO,
					publishVideo: VIDEO,
					resolution:  RESOLUTION,
					frameRate: FRAME_RATE,
					mirror: false
				});

				session.publish(publisher);
			} else {
				initMainVideoThumbnail();

			}
			setPublisherButtonsActions(publisher);

		})
		.catch(error => {
			console.log("There was an error connecting to the session:", error.code, error.message);
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
	return createSession(SESSION_ID).then(sessionId => createToken(sessionId));
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
	const blobMap = new Map();
	for (const remoteControlEntry of remoteControls.entries()) {
		const remoteUser = remoteControlEntry[0];
		const remoteControl = remoteControlEntry[1];
		console.debug("Stopping recording...");
		await remoteControl.stop();
		console.debug("Recording stopped, getting blob...");
		const blob = await remoteControl.getBlob();
		blobMap.set(remoteUser, blob);
		if (!!blob) {
			console.debug("Blob saved: " + blob.size + " bytes");
		} else {
			console.warn("Blob is null");
		}
	}
	recordingBlobs.forEach((blob, remoteUser) => blobMap.set(remoteUser, blob));
	let promises = [];
	blobMap.forEach((blob, remoteUser) => promises.push(sendBlob(blob, fileNamePrefix, remoteUser)));
	return Promise.all(promises);
}

function sendBlob(blob, fileNamePrefix, remoteUserId) {
	var ITEM_NAME = 'ov-qoe-config';

	const url = JSON.parse(window.localStorage.getItem(ITEM_NAME));
	if (url) {
		return new Promise((resolve, reject) => {
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
		});
	} else {
		return Promise.resolve();
	}
}