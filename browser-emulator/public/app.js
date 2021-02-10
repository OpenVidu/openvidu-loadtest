var OPENVIDU_SERVER_URL;
var OPENVIDU_SERVER_SECRET;
var SESSION_ID;
var USER_ID;
var SHOW_VIDEOS;

var OV;
var session;

var lastStatGatheringTime = {};
var lastBytesReceived = {};

window.onload = () => {
	var url = new URL(window.location.href);
	OPENVIDU_SERVER_URL = url.searchParams.get("publicurl");
	OPENVIDU_SERVER_SECRET = url.searchParams.get("secret");
	SESSION_ID = url.searchParams.get("sessionId");
	USER_ID = url.searchParams.get("userId");
	SHOW_VIDEOS = url.searchParams.get("showVideos") === 'true';
	if (!OPENVIDU_SERVER_URL || !OPENVIDU_SERVER_SECRET || !SESSION_ID || !USER_ID) {
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
	OV = new OpenVidu();
	OV.enableProdMode();
	session = OV.initSession();

	session.on("connectionCreated", event => {
		appendEvent({ event: "connectionCreated", content: event.connection.connectionId });
	});

	session.on("streamCreated", event => {
		appendEvent({ event: "streamCreated", content: event.stream.streamId });

		var subscriberContainer = insertSubscriberContainer(event);

		if(!SHOW_VIDEOS){
			subscriberContainer = null;
		}
		var subscriber = session.subscribe(event.stream, subscriberContainer);
		subscriber.on("streamPlaying", e => {
			appendEvent({ event: "streamPlaying", content: event.stream.streamId });
			var userId = event.stream.connection.data;
			window.openviduLoadTest.stats[userId] = [];
			lastStatGatheringTime[userId] = Date.now();
		});
	});

	session.on("streamDestroyed", event => {
		appendEvent({ event: "streamDestroyed", content: event.stream.streamId });
		var userId = event.stream.connection.data;
		document.getElementById('video-' + userId).outerHTML = "";
	});

	session.on("sessionDisconnected", event => {
		appendEvent({ event: "sessionDisconnected", content: session.connection.connectionId });
		document.querySelectorAll('.video-container').forEach(a => {
			a.remove()
		})
	});

	getToken().then(token => {
		session.connect(token, USER_ID)
			.then(() => {

				var videoContainer = null;
				if(SHOW_VIDEOS){
					videoContainer = 'video-publisher';
				}

				var publisher = OV.initPublisher(videoContainer, {
					audioSource: undefined, // The source of audio. If undefined default microphone
					videoSource: undefined, // The source of video. If undefined default webcam
					publishAudio: true,  	// Whether you want to start publishing with your audio unmuted or not
					publishVideo: true,
					resolution:  "640x480",
					frameRate: 30,
					mirror: false
				});
				setPublisherButtonsActions(publisher);

				session.publish(publisher);

			})
			.catch(error => {
				console.log("There was an error connecting to the session:", error.code, error.message);
			});
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
			if(SHOW_VIDEOS){
				videoContainer = 'video-publisher';
			}
			var publisher2 = OV.initPublisher(videoContainer, {
				 resolution: "640x480",
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
		if (e.reason !== 'unpublish') {
			document.getElementById('video-publisher').outerHTML = "";
		}
	});
}

function insertSubscriberContainer(event) {
	var commonTagStyle = "background-color: #0088aa; color: white; font-size: 13px; font-weight: bold; padding: 1px 3px; border-radius: 3px; font-family: 'Arial'";
	var videoContainer = document.createElement('div');
	videoContainer.id = 'video-' + event.stream.connection.data;
	videoContainer.className = 'video-container';
	videoContainer.setAttribute("style", "display: inline-block; margin: 5px 5px 0 0");
	var infoContainer = document.createElement('div');
	infoContainer.setAttribute("style", "display: flex; justify-content: space-between; margin-bottom: 3px; border: 2px solid;");
	var userId = document.createElement('div');
	userId.setAttribute("style", commonTagStyle);
	userId.innerText = event.stream.connection.data;
	var resolution = document.createElement('div');
	resolution.id = 'resolution-' + event.stream.connection.data;
	resolution.setAttribute("style", "display: inline-block; " + commonTagStyle);
	resolution.innerText = event.stream.videoDimensions.width + 'x' + event.stream.videoDimensions.height;
	var rtt = document.createElement('div');
	rtt.id = 'rtt-' + event.stream.connection.data;
	rtt.setAttribute("style", "display: inline-block; " + commonTagStyle);
	var delayMs = document.createElement('div');
	delayMs.id = 'delay-' + event.stream.connection.data;
	delayMs.setAttribute("style", "display: inline-block; " + commonTagStyle);
	var jitter = document.createElement('div');
	jitter.id = 'jitter-' + event.stream.connection.data;
	jitter.setAttribute("style", "display: inline-block; " + commonTagStyle);
	var receiveBandwidth = document.createElement('div');
	receiveBandwidth.id = 'receive-bandwidth-' + event.stream.connection.data;
	receiveBandwidth.setAttribute("style", "display: inline-block; " + commonTagStyle);
	var bitrate = document.createElement('div');
	bitrate.id = 'bitrate-' + event.stream.connection.data;
	bitrate.setAttribute("style", commonTagStyle);
	infoContainer.appendChild(userId);
	infoContainer.appendChild(resolution);
	infoContainer.appendChild(rtt);
	infoContainer.appendChild(delayMs);
	infoContainer.appendChild(jitter);
	infoContainer.appendChild(receiveBandwidth);
	infoContainer.appendChild(jitter);
	infoContainer.appendChild(bitrate);
	videoContainer.appendChild(infoContainer);
	document.body.appendChild(videoContainer);
	return videoContainer;
}

function initFormValues() {
	document.getElementById("form-publicurl").value = OPENVIDU_SERVER_URL;
	document.getElementById("form-secret").value = OPENVIDU_SERVER_SECRET;
	document.getElementById("form-sessionId").value = SESSION_ID;
	document.getElementById("form-userId").value = USER_ID;
	document.getElementById("form-showVideos").checked = SHOW_VIDEOS;
}

function joinWithForm() {
	OPENVIDU_SERVER_URL = document.getElementById("form-publicurl").value;
	OPENVIDU_SERVER_SECRET = document.getElementById("form-secret").value;
	SESSION_ID = document.getElementById("form-sessionId").value;
	USER_ID = document.getElementById("form-userId").value;
	SHOW_VIDEOS = document.getElementById("form-showVideos").checked;

	document.getElementById('join-form').style.display = 'none';
	joinSession();
	return false;
}

function getToken() {
	return createSession(SESSION_ID).then(sessionId => createToken(sessionId));
}

function createSession(sessionId) { // See https://docs.openvidu.io/en/stable/reference-docs/REST-API/#post-openviduapisessions
	return new Promise((resolve, reject) => {
		$.ajax({
			type: "POST",
			url: OPENVIDU_SERVER_URL + "/openvidu/api/sessions",
			data: JSON.stringify({ customSessionId: sessionId }),
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
            data: JSON.stringify({}),
            headers: {
                'Authorization': 'Basic ' + btoa('OPENVIDUAPP:' + OPENVIDU_SERVER_SECRET),
                'Content-Type': 'application/json',
            },
            success: (response) => resolve(response.token),
            error: (error) => reject(error)
        });
    });
}

function collectEventsAndStats() {
	this.session.streamManagers.forEach(streamManager => {
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
			if (isSubscriber) {
				document.querySelector('#rtt-' + userId).innerText = 'RTT: ' + userStatsJson.rtt + ' ms';
			} else {
				document.querySelector('#rtt').innerText = 'RTT: ' + userStatsJson.rtt + ' ms';
			}
		}

		var videoBwe = fullReport.find(report => report.type === 'VideoBwe');
		if (!!videoBwe) {
			if (isSubscriber) {
				userStatsJson.availableReceiveBandwidth = Math.floor(videoBwe.googAvailableReceiveBandwidth / 1024);
				document.querySelector('#receive-bandwidth-' + userId).innerText = 'Bandwidth: ' + userStatsJson.availableReceiveBandwidth + ' kbps';
			} else {
				userStatsJson.availableSendBandwidth = Math.floor(videoBwe.googAvailableSendBandwidth / 1024);
				userStatsJson.bitrate = Math.floor(videoBwe.googTransmitBitrate / 1024);
				document.querySelector('#send-bandwidth').innerText = 'Bandwidth: ' + userStatsJson.availableSendBandwidth + ' kbps';
				document.querySelector('#bitrate').innerText = userStatsJson.bitrate + ' kbps';
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

				document.querySelector('#delay-' + userId).innerText = 'Delay: ' + userStatsJson.delay + ' ms';
				document.querySelector('#jitter-' + userId).innerText = 'jitter: ' + userStatsJson.jitter;
				document.querySelector('#bitrate-' + userId).innerText = userStatsJson.bitrate + ' kbps';
			} else {
				userStatsJson.bytesSent = Number(videoStats.bytesSent);
			}
			appendStats(userId, userStatsJson);
		}
	}, null, errorCallback);
}