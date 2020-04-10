const RESOLUTION = "540x360";

var OPENVIDU_SERVER_URL;
var OPENVIDU_SERVER_SECRET;
var SESSION_ID;
var USER_ID;

var OV;
var session;

var lastStatGatheringTime = {};
var lastBytesReceived = {};
var webComponent;

window.onload = () => {
	var url = new URL(window.location.href);
	console.log("URL", url)
	startTime();

	webComponent = document.querySelector('openvidu-webcomponent');

	OPENVIDU_SERVER_URL = url.searchParams.get("publicurl");
	OPENVIDU_SERVER_SECRET = url.searchParams.get("secret");
	SESSION_ID = url.searchParams.get("sessionId");
	USER_ID = url.searchParams.get("userId");

	if (!OPENVIDU_SERVER_URL || !OPENVIDU_SERVER_SECRET || !SESSION_ID || !USER_ID ) {
		initFormValues();
		document.getElementById('join-form').style.display = 'block';
	} else {
		window.openviduLoadTest.sessionId = SESSION_ID;
		window.collectEventsAndStats = this.collectEventsAndStats;
		window.resetEventsAndStats = this.resetEventsAndStats;
		joinSession();
	}
};

function appendEvent(newEvent) {
	window.openviduLoadTest.events.push(newEvent);
}

function appendStats(userId, stat) {
	window.openviduLoadTest.stats[userId].push(stat);
}

function joinSession() {

	webComponent.addEventListener('sessionCreated', (event) => {
		session = event.detail;

		session.on("connectionCreated", event => {
			appendEvent({ event: "connectionCreated", content: event.connection.connectionId });
		});

		session.on("streamCreated", event => {
			appendEvent({ event: "streamCreated", content: event.stream.streamId });
			setTimeout(() => {
				event.stream.streamManager.on("streamPlaying", e => {
					appendEvent({ event: "streamPlaying", content: event.stream.streamId });
					var userId = event.stream.connection.data;
					window.openviduLoadTest.stats[userId] = [];
					lastStatGatheringTime[userId] = Date.now();
				})
			}, 100);
		});

		session.on("streamDestroyed", event => {
			appendEvent({ event: "streamDestroyed", content: event.stream.streamId });
		});

		session.on("sessionDisconnected", event => {
			appendEvent({ event: "sessionDisconnected", content: session.connection.connectionId });
		});

	});

	webComponent.addEventListener('publisherCreated', (event) => {
        var publisher = event.detail;
        publisher.once("accessAllowed", e => {
			appendEvent({ event: "accessAllowed", content: '' });
		});
		publisher.once("streamCreated", e => {
			appendEvent({ event: "streamCreated", content: e.stream.streamId });
		});
		publisher.once("streamPlaying", e => {
			appendEvent({ event: "streamPlaying", content: 'Publisher' });
			window.openviduLoadTest.stats[USER_ID] = [];
		});
		publisher.once("streamDestroyed", e => {
			appendEvent({ event: "streamDestroyed", content: e.stream.streamId });
		});
    });

    webComponent.addEventListener('error', (event) => {
        console.log('Error event', event.detail);
	});

	var tokens = [];

	var ovSettings = {
		chat: true,
		autopublish: true,
		toolbarButtons: {
		  audio: true,
		  video: true,
		  screenShare: false,
		  fullscreen: true,
		  layoutSpeaking: true,
		  exit: true,
		}
	  };


	getToken().then(token => {
		console.log("token", token);
		console.log("userID", USER_ID);
		tokens.push(token);
		webComponent.sessionConfig = { sessionName: SESSION_ID, user: USER_ID, tokens, ovSettings };
		webComponent.style.display = 'block';
	});

}

function leaveSession() {
	webComponent.sessionConfig = {};
}

window.onbeforeunload = () => {
	if (webComponent) leaveSession();
};


function initFormValues() {
	document.getElementById("form-publicurl").value = OPENVIDU_SERVER_URL;
	document.getElementById("form-secret").value = OPENVIDU_SERVER_SECRET;
	document.getElementById("form-sessionId").value = SESSION_ID;
	document.getElementById("form-userId").value = USER_ID;
}

function joinWithForm() {
	OPENVIDU_SERVER_URL = document.getElementById("form-publicurl").value;
	OPENVIDU_SERVER_SECRET = document.getElementById("form-secret").value;
	SESSION_ID = document.getElementById("form-sessionId").value;
	USER_ID = document.getElementById("form-userId").value;
	document.getElementById('join-form').style.display = 'none';
	joinSession();
	return false;
}

function getToken() {
	return createSession().then(sessionId => createToken(sessionId));
}

function createSession() { // See https://openvidu.io/docs/reference-docs/REST-API/#post-apisessions
	return new Promise((resolve, reject) => {
		var request = new XMLHttpRequest();
		request.open("POST", OPENVIDU_SERVER_URL + "api/sessions", true);
		request.setRequestHeader('Content-Type', 'application/json');
		request.setRequestHeader('Authorization', "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SERVER_SECRET));
		request.onreadystatechange = () => {
			if (request.readyState === 4) {
				if (request.status === 200 || request.status === 409) {
					resolve(SESSION_ID);
				} else {
					console.warn('No connection to OpenVidu Server. This may be a certificate error at ' + OPENVIDU_SERVER_URL);
					if (window.confirm('No connection to OpenVidu Server. This may be a certificate error at \"' + OPENVIDU_SERVER_URL + '\"\n\nClick OK to navigate and accept it. ' +
						'If no certificate warning is shown, then check that your OpenVidu Server is up and running at "' + OPENVIDU_SERVER_URL + '"')) {
						location.assign(OPENVIDU_SERVER_URL + '/accept-certificate');
					}
				}
			};
		}
		var properties = {customSessionId: SESSION_ID};

		console.log("Session properties : ", properties);

		request.send(JSON.stringify(properties));
	});
}

function createToken() { // See https://openvidu.io/docs/reference-docs/REST-API/#post-apitokens
	return new Promise((resolve, reject) => {
		var request = new XMLHttpRequest();
		request.open("POST", OPENVIDU_SERVER_URL + "api/tokens", true);
		request.setRequestHeader('Content-Type', 'application/json');
		request.setRequestHeader('Authorization', "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SERVER_SECRET));
		request.onreadystatechange = () => {
			if (request.readyState === 4) {
				if (request.status == 200) {
					resolve(JSON.parse(request.response).token);
				} else {
					reject(new Error(request.responseText))
				}
			};
		}

		var properties = {
			session: SESSION_ID,
		};

		request.send(JSON.stringify(properties));
	});
}

function collectEventsAndStats() {
	session.streamManagers.forEach(streamManager => {
		this.gatherStatsForPeer(streamManager.stream.getRTCPeerConnection(), streamManager.stream.connection.data, streamManager.remote);
	});
}

function resetEventsAndStats() {
	window.openviduLoadTest.events = [];
	Object.keys(window.openviduLoadTest.stats).forEach(userId => {
		window.openviduLoadTest.stats[userId] = [];
	});
}

function gatherStatsForPeer(rtcPeerConnection, userId, isSubscriber, errorCallback) {
	return rtcPeerConnection.getStats(response => {
		const fullReport = [];
		response.result().forEach(report => {
			const stat = {
				id: report.id,
				timestamp: report.timestamp,
				type: report.type
			};
			report.names().forEach((name) => {
				stat[name] = report.stat(name);
			});
			fullReport.push(stat);
		});

		var userStatsJson = {};

		var activeCandidateStats = fullReport.find(report => report.type === 'googCandidatePair' && report.googActiveConnection === 'true');
		if (!!activeCandidateStats) {
			userStatsJson.timestamp = activeCandidateStats.timestamp.getTime();
			userStatsJson.rtt = Number(activeCandidateStats.googRtt);
			userStatsJson.transport = activeCandidateStats.googTransportType;
			userStatsJson.candidateType = activeCandidateStats.googRemoteCandidateType;
			userStatsJson.localAddress = activeCandidateStats.googLocalAddress;
			userStatsJson.remoteAddress = activeCandidateStats.googRemoteAddress;

		}

		var videoBwe = fullReport.find(report => report.type === 'VideoBwe');
		if (!!videoBwe) {
			if (isSubscriber) {
				userStatsJson.availableReceiveBandwidth = Math.floor(videoBwe.googAvailableReceiveBandwidth / 1024);
			} else {
				userStatsJson.availableSendBandwidth = Math.floor(videoBwe.googAvailableSendBandwidth / 1024);
				userStatsJson.bitrate = Math.floor(videoBwe.googTransmitBitrate / 1024);
			}
		}

		var videoStats = fullReport.find(report => report.type === 'ssrc' && report.mediaType === 'video');
		if (!!videoStats) {
			userStatsJson.packetsLost = Number(videoStats.packetsLost);
			if (isSubscriber) {
				if (!lastBytesReceived[userId]) {
					// First time gatherStats is called for this user
					userStatsJson.bitrate = Math.floor((Number(videoStats.bytesReceived) * 8) / ((videoStats.timestamp.getTime() - lastStatGatheringTime[userId])));
				} else {
					userStatsJson.bitrate = Math.floor(((Number(videoStats.bytesReceived) - lastBytesReceived[userId]) * 8) / ((videoStats.timestamp.getTime() - lastStatGatheringTime[userId])));
				}
				userStatsJson.bytesReceived = Number(videoStats.bytesReceived);
				userStatsJson.jitter = Number(videoStats.googJitterBufferMs);
				userStatsJson.delay = Number(videoStats.googCurrentDelayMs);
				userStatsJson.packetsLost = Number(videoStats.packetsLost);
				userStatsJson.framesDecoded = Number(videoStats.framesDecoded);

				// Store variables for next stats gathering
				lastStatGatheringTime[userId] = videoStats.timestamp.getTime();
				lastBytesReceived[userId] = userStatsJson.bytesReceived;
			} else {
				userStatsJson.bytesSent = Number(videoStats.bytesSent);
			}
			appendStats(userId, userStatsJson);
		}
	}, null, errorCallback);
}

function startTime() {
	document.getElementById('time').innerHTML = new Date().toISOString();
	t = setTimeout(() => startTime(), 10);
}