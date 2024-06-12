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
var LivekitClient = window.LivekitClient;
var trackUser = new Map();

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
	QOE_ANALYSIS = url.searchParams.get("qoeAnalysis") === 'true';
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

var beConnector;
var recordingManager;
var statsManager;

async function joinSession() {
	console.log("Joining session " + SESSION_ID + "...");
	beConnector = new BrowserEmulatorConnector();
	recordingManager = new BrowserEmulatorRecorderManager(beConnector);
	statsManager = new WebRTCStatsManager(beConnector);
	let roomOptions = {
		adaptiveStream: false,
		publishDefaults: {
			simulcast: false,
			videoEncoding: {
				maxFramerate: FRAME_RATE,
				maxBitrate: 10_000_000,
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

	beConnector.sendEvent({ event: "connectionStart" }, USER_ID, SESSION_ID);
	session = new LivekitClient.Room(roomOptions);
	var room = session;

	room.on(LivekitClient.RoomEvent.Connected, () => {
		appendElement('local-connection-created');
		beConnector.sendEvent({ event: "Connected" }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
		let resSplit = RESOLUTION.split('x');
		let width = resSplit[0];
		let height = resSplit[1];
		const trackInfo = {
			track: track,
			participantId: participant.identity,
			sessionId: SESSION_ID,
			type: track.kind,
			videoHeight: height,
			videoWidth: width,
			isLocal: false
		}
		try {
			statsManager.addConnectionToStats(room.engine.pcManager?.publisher['_pc'], participant.sid, "outbound");
			statsManager.addConnectionToStats(room.engine.pcManager?.subscriber['_pc'], participant.sid, "inbound");
		} catch (error) {
			if (error.contains("already managing")) {
				console.warn(error);
			}
			else {
				throw error;
			}
		}
		let remoteUser = participant.identity;
		beConnector.sendEvent({ event: "TrackSubscribed", connectionId: participant.sid,  connection: 'remote', trackInfo, remoteUser }, USER_ID, SESSION_ID);
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
			if (!trackUser.has(participant.sid)) {
				trackUser.set(participant.sid, track);
			} else {
				console.log(USER_ID + " starting recording user " + remoteUser);
				let stream = new MediaStream([trackUser.get(participant.sid).mediaStreamTrack, track.mediaStreamTrack]);
				const mediaRecorder = recordingManager.createRecorder(USER_ID, remoteUser, SESSION_ID, stream);
				mediaRecorder.start();
			}
		}
	});

	room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
		let resSplit = RESOLUTION.split('x');
		let width = resSplit[0];
		let height = resSplit[1];
		const trackInfo = {
			track: track,
			participantId: participant.identity,
			sessionId: SESSION_ID,
			type: track.kind,
			videoHeight: height,
			videoWidth: width,
			isLocal: false
		}
		let remoteUser = participant.identity;
		beConnector.sendEvent({event: "TrackUnsubscribed", connectionId: participant.sid,  connection: 'remote', trackInfo, remoteUser }, USER_ID, SESSION_ID);
		track.detach();
		if (!!QOE_ANALYSIS) {
			console.log(USER_ID + " stopping recording user " + remoteUser);
			recordingManager.stopRecordingFromUser(remoteUser);
		}
	});

	room.on(LivekitClient.RoomEvent.Disconnected, () => {
		//statsManager.deleteAllProviders();
		document.querySelectorAll('.video-remote-container').forEach(a => {
			a.remove();
		});
		beConnector.sendEvent({event: "Disconnected", connection: 'local' }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.Reconnecting, () => {
		beConnector.sendEvent({event: "Reconnecting", connection: 'local' }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.Reconnected, () => {
		beConnector.sendEvent({event: "Reconnected", connection: 'local' }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.MediaDevicesError, error => {
		beConnector.sendEvent({ event: "exception", reason: error.message, event_type: "MediaDevicesError" }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.SignalConnected, () => {
		beConnector.sendEvent({ event: "SignalConnected" }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.LocalTrackPublished, (localTrackPublication, localParticipant) => {
		const track = localTrackPublication.track;
		let resSplit = RESOLUTION.split('x');
		let width = resSplit[0];
		let height = resSplit[1];
		const trackInfo = {
			track: track,
			participantId: localParticipant.identity,
			sessionId: SESSION_ID,
			type: track.kind,
			videoHeight: height,
			videoWidth: width,
			isLocal: true
		}
		beConnector.sendEvent({ event: "LocalTrackPublished", connectionId: localParticipant.sid, connection: 'local', trackInfo }, USER_ID, SESSION_ID);
		if (SHOW_VIDEO_ELEMENTS) {
			const element = track.attach();
			document.getElementById('video-publisher').appendChild(element);
		}
		appendElement('local-stream-created');
		try {
			statsManager.addConnectionToStats(room.engine.pcManager?.publisher['_pc'], localParticipant.sid, "outbound");
			statsManager.addConnectionToStats(room.engine.pcManager?.subscriber['_pc'], localParticipant.sid, "inbound");
		} catch (error) {
			if (error.contains("already managing")) {
				console.warn(error);
			}
			else {
				throw error;
			}
		}
	});

	room.on(LivekitClient.RoomEvent.LocalTrackUnpublished, (localTrackPublication, localParticipant) => {
		const track = localTrackPublication.track;
		let resSplit = RESOLUTION.split('x');
		let width = resSplit[0];
		let height = resSplit[1];
		const trackInfo = {
			track: track,
			participantId: localParticipant.identity,
			sessionId: SESSION_ID,
			type: track.kind,
			videoHeight: height,
			videoWidth: width,
			isLocal: true
		}
		beConnector.sendEvent({ event: "LocalTrackUnpublished", connectionId: localParticipant.sid, connection: 'local', trackInfo }, USER_ID, SESSION_ID);
		localTrackPublication.track.detach();
		var div = document.getElementById('video-publisher')
		if (!!div)
			div.outerHTML = "";
	});

	room.on(LivekitClient.RoomEvent.ActiveDeviceChanged, (kind, deviceId) => {
		beConnector.sendEvent({ event: "ActiveDeviceChanged", kind, deviceId }, USER_ID, SESSION_ID);
	});

	// room.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, (speakers) => {
	// 	beConnector.sendEvent({ event: "ActiveSpeakersChanged", speakers }, USER_ID, SESSION_ID);
	// });

	room.on(LivekitClient.RoomEvent.AudioPlaybackStatusChanged, () => {
		beConnector.sendEvent({ event: "AudioPlaybackStatusChanged" }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.ConnectionQualityChanged, (quality, participant) => {
		beConnector.sendEvent({ event: "ConnectionQualityChanged", quality, participant: participant.identity, participantSid: participant.sid }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.ConnectionStateChanged, (state) => {
		beConnector.sendEvent({ event: "ConnectionStateChanged", state }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.DCBufferStatusChanged, () => {
		beConnector.sendEvent({ event: "DCBufferStatusChanged" }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.ParticipantConected, (participant) => {
		beConnector.sendEvent({ event: "ParticipantConected", participant: participant.identity, participantSid: participant.sid }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
		beConnector.sendEvent({ event: "ParticipantDisconnected", participant: participant.identity, participantSid: participant.sid }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.TrackPublished, (remoteTrackPublication, remoteParticipant) => {
		beConnector.sendEvent({ event: "TrackPublished", connectionId: remoteParticipant.sid, connection: 'remote', remoteUser: remoteParticipant.identity }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.TrackUnpublished, (remoteTrackPublication, remoteParticipant) => {
		beConnector.sendEvent({ event: "TrackUnpublished", connectionId: remoteParticipant.sid, connection: 'remote', remoteUser: remoteParticipant.identity }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.TrackStreamStateChanged, (pub, streamState, participant) => {
		beConnector.sendEvent({ event: "TrackStreamStateChanged", streamState, participant: participant.identity, participantSid: participant.sid }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.TrackSubscriptionFailed, (track, publication, participant) => {
		beConnector.sendEvent({ event: "TrackSubscriptionFailed", connectionId: participant.sid, connection: 'remote', remoteUser: participant.identity }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.TrackSubscriptionStatusChanged, (remoteTrackPublication, status, remoteParticipant) => {
		beConnector.sendEvent({ event: "TrackSubscriptionStatusChanged", connectionId: remoteParticipant.sid, connection: 'remote', status, remoteUser: remoteParticipant.identity }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
		beConnector.sendEvent({ event: "TrackUnsubscribed", connectionId: participant.sid, connection: 'remote', remoteUser: participant.identity }, USER_ID, SESSION_ID);
	});

	room.on(LivekitClient.RoomEvent.VideoPlaybackStatusChanged, () => {
		beConnector.sendEvent({ event: "VideoPlaybackStatusChanged" }, USER_ID, SESSION_ID);
	});

	var resSplit = RESOLUTION.split('x');
	var width = resSplit[0];
	var height = resSplit[1];

	room.connect(OPENVIDU_SERVER_URL, OPENVIDU_TOKEN)
		.then(async () => {
			console.log("Connected to session " + SESSION_ID);
			if (ROLE === 'PUBLISHER') {
				console.log("User " + USER_ID + " is publisher, publishing video and audio...");
				try {
					await room.localParticipant.enableCameraAndMicrophone();
					console.log("Publisher initialized");
					beConnector.sendEvent({ event: "connectedPublisher" }, USER_ID, SESSION_ID);
					setPublisherButtonsActions(room);
				} catch (err) {
					console.error(err);
					console.error(JSON.stringify(err));
					beConnector.sendError(err, USER_ID, SESSION_ID);
				}
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
	session.disconnect().then(() => {
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
	});
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
			// TODO: Reimplement for LK
			// if (event.target.innerText === 'Unpublish') {
			// 	publisher.unpublishTracks(publisher.tracks);
			// 	event.target.innerText = 'Publish';
			// } else {
			// 	var elem = document.getElementById('video-publisher');
			// 	elem.parentNode.removeChild(elem);

			// 	var videoContainer = null;
			// 	if(SHOW_VIDEO_ELEMENTS){
			// 		videoContainer = 'video-publisher';
			// 	}
			// 	var publisher2 = OV.initPublisher(videoContainer, {
			// 		 resolution: RESOLUTION,
			// 		 frameRate: 30,
			// 		 mirror: false
			// 	});
			// 	setPublisherButtonsActions(publisher2);
			// 	session.publish(publisher2);
			// 	event.target.innerText = 'Unpublish';
			// }
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