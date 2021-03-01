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

var OV;
var session;

var lastStatGatheringTime = {};
var lastBytesReceived = {};

window.onload = () => {
	var url = new URL(window.location.href);
	OPENVIDU_SERVER_URL = url.searchParams.get("publicurl");
	OPENVIDU_SERVER_SECRET = url.searchParams.get("secret");
	OPENVIDU_TOKEN = url.searchParams.get("token");
	SESSION_ID = url.searchParams.get("sessionId");
	USER_ID = url.searchParams.get("userId");
	AUDIO = url.searchParams.get("audio");
	VIDEO = url.searchParams.get("video");
	RESOLUTION = url.searchParams.get("resolution");
	ROLE = url.searchParams.get("role");
	RECORDING_OUTPUT_MODE = url.searchParams.get("recordingmode");
	FRAME_RATE = url.searchParams.get("frameRate");
	SHOW_VIDEO_ELEMENTS = url.searchParams.get("showVideoElements") === 'true';

	const tokenCanBeCreated = !!USER_ID && !!SESSION_ID && !!OPENVIDU_SERVER_URL && !!OPENVIDU_SERVER_SECRET;
	const tokenHasBeenReceived = !!USER_ID && !!OPENVIDU_TOKEN;

	if(tokenCanBeCreated || tokenHasBeenReceived){
		window.openviduLoadTest.sessionId = SESSION_ID;
		window.collectEventsAndStats = this.collectEventsAndStats;
		window.resetEventsAndStats = this.resetEventsAndStats;
		joinSession();
	} else {
		initFormValues();
		document.getElementById('join-form').style.display = 'block';
	}
};

function appendElement(id) {
    var eventsDiv = document.getElementById('openvidu-events');
    var element = document.createElement('div');
    element.setAttribute("id", id);
    eventsDiv.appendChild(element);
}

async function joinSession() {
	OV = new OpenVidu();
	// OV.enableProdMode();
	session = OV.initSession();

	session.on("connectionCreated", event => {
		// appendEvent({ event: "connectionCreated", content: event.connection.connectionId });
		if (event.connection.connectionId === session.connection.connectionId) {
			appendElement('local-connection-created');
		}
	});

	session.on("streamCreated", event => {
		// appendEvent({ event: "streamCreated", content: event.stream.streamId });

		var subscriberContainer = insertSubscriberContainer(event);

		var videoContainer = null;
		if(SHOW_VIDEO_ELEMENTS){
			videoContainer = 'remote-video-publisher';
		}
		var subscriber = session.subscribe(event.stream, videoContainer);
		subscriber.on("streamPlaying", e => {
		});
	});

	session.on("streamDestroyed", event => {
	});

	session.on("sessionDisconnected", event => {
		document.querySelectorAll('.video-container').forEach(a => {
			a.remove()
		})
	});

	if (!OPENVIDU_TOKEN) {
		OPENVIDU_TOKEN = await getToken();
	}

	session.connect(OPENVIDU_TOKEN, USER_ID)
		.then(() => {

			if(ROLE === 'PUBLISHER') {
				var videoContainer = null;
				if(SHOW_VIDEO_ELEMENTS){
					videoContainer = 'video-publisher';
				}

				var publisher = OV.initPublisher(videoContainer, {
					audioSource: undefined,
					videoSource: undefined,
					publishAudio: AUDIO,
					publishVideo: VIDEO,
					resolution:  RESOLUTION,
					frameRate: FRAME_RATE
				});

				setPublisherButtonsActions(publisher);
				session.publish(publisher);
			}
		})
		.catch(error => {
			console.log("There was an error connecting to the session:", error.code, error.message);
		});

}

function leaveSession() {
	session.disconnect();
}

window.onbeforeunload = () => {
	if (session) leaveSession();
};

function setPublisherButtonsActions(publisher) {
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
	document.getElementById('leave').onclick = () => {
		session.disconnect();
	}
	publisher.once("accessAllowed", e => {
	});
	publisher.once("streamCreated", e => {
		appendElement('local-stream-created');
	});
	publisher.once("streamPlaying", e => {
	});
	publisher.once("streamDestroyed", e => {
		if (e.reason !== 'unpublish') {
			document.getElementById('video-publisher').outerHTML = "";
		}
	});
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

function joinWithForm() {
	OPENVIDU_SERVER_URL = document.getElementById("form-publicurl").value;
	OPENVIDU_SERVER_SECRET = document.getElementById("form-secret").value;
	SESSION_ID = document.getElementById("form-sessionId").value;
	USER_ID = document.getElementById("form-userId").value;
	RESOLUTION = document.getElementById("form-resolution").value;
	FRAME_RATE = document.getElementById("form-frameRate").value;
	SHOW_VIDEO_ELEMENTS = document.getElementById("form-showVideoElements").checked;
	ROLE = document.getElementById("form-role-publisher").checked ? 'PUBLISHER' : 'SUBSCRIBER';

	document.getElementById('join-form').style.display = 'none';
	joinSession();
	return false;
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
				console.log(error);
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
