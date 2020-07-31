var OPENVIDU_SERVER_URL;
var SESSION_ID;
var PATH_API;
var USER_ID;
var ROLE;

var OV;
var session;

var lastStatGatheringTime = {};
var lastBytesReceived = {};
var webComponent;

window.onload = async () => {
    var url = new URL(window.location.href);
	console.log("URL", url)
    startTime();

	OPENVIDU_SERVER_URL = url.searchParams.get("publicurl").replace(/\/$/, "");
    SESSION_ID = url.searchParams.get("sessionId");
    PATH_API = `/classroom/api/sessions/${SESSION_ID}/participants`;
    USER_ID = url.searchParams.get("userId");
	ROLE = url.searchParams.get("role") || "TEACHER";

    console.log(`Request token url: ${OPENVIDU_SERVER_URL}${PATH_API}`);
    console.log(`Session id: + ${SESSION_ID}`);
    console.log(`Role: ${ROLE}`);
	console.log(`userId: ${USER_ID}`);

	document.getElementById("user-id").innerHTML += USER_ID;

    var participant = {
        name: USER_ID,
        role: ROLE
    }

    var tokenUrl = await addParticipant(participant);
    var htmlClassRoom = await getClassroomWeb(tokenUrl);

    // Initialize variables
    window.openviduLoadTest.sessionId = SESSION_ID;
	window.collectEventsAndStats = this.collectEventsAndStats;
    window.resetEventsAndStats = this.resetEventsAndStats;
    loadClassRoomWebComponent(htmlClassRoom);
    console.log();
}

async function addParticipant(participant) {
    var addParticipantUrl = OPENVIDU_SERVER_URL + PATH_API;
    try {
        var result = JSON.parse(await addParticipantRequest(addParticipantUrl, participant));
        var tokenUrl = result.token + "&autoJoinRoom=true";
        return tokenUrl;
    } catch (error) {
        alert("An error has ocurred while adding the participant");
        console.error(error);
    }
}

async function addParticipantRequest(addParticipantUrl, participant) {
	return new Promise((resolve, reject) => {
        $.ajax({
            type: 'POST',
            url: addParticipantUrl,
            data: JSON.stringify(participant),
            headers: {
                Authorization: 'Basic ' + btoa('user1:pass'),
                'Content-Type': 'application/json',
            },
            success: (response) => resolve(response),
            error: (error) => reject(error),
        });
    });
}

async function getClassroomWeb(url) {
    return new Promise((resolve, reject) => {
       $.ajax({
            type: 'GET',
            url: url,
            success: (response) => {
                var rawHtml = response;
                resolve(new DOMParser().parseFromString(rawHtml, "text/html"));
            },
            error: (error) => reject(error),
       });
    });
}

function appendEvent(newEvent) {
	console.warn("==== APPENDING EVENTS!!! ====");
	console.warn(newEvent.event);
	window.openviduLoadTest.events.push(newEvent);
	console.warn("==== APPENDING EVENTS!!! ====");
}

function appendStats(data, stat) {
	console.warn("==== Appending stats ====");
	var userId = JSON.parse(data).clientData;
	console.warn(userId);
	console.warn(stat);
	console.warn(window.openviduLoadTest.stats)
	console.warn("==== Appending stats ====");
	window.openviduLoadTest.stats[userId].push(stat);
}

function leaveSession() {
	webComponent.sessionConfig = {};
}

window.onbeforeunload = () => {
	if (webComponent) leaveSession();
};

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

async function loadClassRoomWebComponent(htmlClassRoom) {
    // Download webcomponent js
    var rawScriptWebComp = htmlClassRoom.getElementsByTagName('script')[0];
    var webComponentJsPath = rawScriptWebComp.src.replace(/https?:\/\/[^\/]+/i, "");
    var webComponentJsSrc = OPENVIDU_SERVER_URL + webComponentJsPath;
    var webComponentScript = document.createElement('script');
    webComponentScript.setAttribute('src', webComponentJsSrc);
    document.head.appendChild(webComponentScript);

    // Download webcomponent css
    var rawCssWebComp = htmlClassRoom.getElementsByTagName('link')[1];
    var webComponentCssPath = rawCssWebComp.href.replace(/https?:\/\/[^\/]+/i, "");
    var webComponentCssHref = OPENVIDU_SERVER_URL + webComponentCssPath;
    var webComponentCss = document.createElement('link');
    webComponentCss.setAttribute('href', webComponentCssHref);
    webComponentCss.setAttribute('rel', 'stylesheet');
    document.head.appendChild(webComponentCss);

    // Get name of the webcomponent
    var sessionConfig = htmlClassRoom.getElementById('classroom-webcomponent').getAttribute('session-config');
    var rawWebComponent = htmlClassRoom.getElementById('classroom-webcomponent').outerHTML;
    var webComponentName = rawWebComponent.substring(
        rawWebComponent.indexOf("<") + 1,
        rawWebComponent.indexOf(" ")
    );
    var webComponent = document.createElement(webComponentName);
    webComponent.setAttribute('id', 'classroom-webcomponent');
    webComponent.setAttribute('session-config', sessionConfig);

    webComponent.addEventListener('sessionCreated', (event) => {
		session = event.detail;

		session.on("connectionCreated", event => {
			appendEvent({ event: "connectionCreated", content: event.connection.connectionId });
		});

		session.on("streamCreated", event => {
			appendEvent({ event: "streamCreated", content: event.stream.streamId });
			console.warn("SESSION STREAM CREATED");
			setTimeout(() => {
				event.stream.streamManager.on("streamPlaying", e => {
					console.warn("SESSION streamPlaying");
					appendEvent({ event: "streamPlaying", content: event.stream.streamId });
					var userId = JSON.parse(event.stream.connection.data).clientData;
					console.log("======== Before Add it =======");
					console.warn(window.openviduLoadTest.stats);
					console.warn(userId);
					window.openviduLoadTest.stats[userId] = [];
					console.log("======== After Add it =======");
					console.warn(window.openviduLoadTest.stats);
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

    document.getElementById('webcomponent-div').appendChild(webComponent);
    //var webCompontentElem = document.createElement('')
}

function startTime() {
    var date = new Date().toISOString();
	document.getElementById('time').innerHTML = date.substring(0, date.length - 5);
	t = setTimeout(() => startTime(), 1000);
}
