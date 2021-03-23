import * as KurentoClient from "kurento-client";
import { writeFile } from "fs/promises";

export { getComplexType } from "kurento-client";

const kurento = {
	client: null,
	pipeline: null,
	player: null,
	recorders: [],
	recorderPathPrefix: "",

	// DEBUG
	numWebRtcEndpoints: 0,
};

/**
 * @param kurentoUrl URI of the Kurento Media Server RPC endpoint.
 *
 * @param playerPath Path to the source media that is sent with WebRTC.
 *
 * @param recorderPathPrefix Used as recording path to store received streams.
 * The Recorder will complete this path with a number and extension. E.g.:
 * recorderPathPrefix = "/path/to/file" becomes "/path/to/file_0.webm".
 *
 * Recording is disabled if this parameter is undefined.
 */
export async function init(
	kurentoUrl: string,
	playerPath: string = "/tmp/video.mkv",
	recorderPathPrefix: string | undefined = undefined
): Promise<void> {
	console.log(
		"[KurentoClient] Connect with Kurento Media Server:",
		kurentoUrl
	);

	kurento.client = await KurentoClient.getSingleton(kurentoUrl);
	console.log("[KurentoClient] Kurento client connected");

	kurento.pipeline = await kurento.client.create("MediaPipeline");
	console.log("[KurentoClient] Kurento MediaPipeline created");

	kurento.pipeline.on("Error", (event: any): void => {
		console.error(
			"[KurentoClient] MediaPipeline ERROR %d (%s): %s",
			event.errorCode,
			event.type,
			event.description
		);
	});

	kurento.player = await kurento.pipeline.create("PlayerEndpoint", {
		uri: `file://${playerPath}`,
		useEncodedMedia: true,
	});
	console.log(
		"[KurentoClient] Kurento PlayerEndpoint created, uri:",
		await kurento.player.getUri()
	);

	kurento.player.on("Error", (event: any): void => {
		console.error(
			"[KurentoClient] PlayerEndpoint ERROR %d (%s): %s",
			event.errorCode,
			event.type,
			event.description
		);
	});

	kurento.player.on(
		"EndOfStream",
		async (_event: any): Promise<void> => {
			console.log(
				"[KurentoClient] Kurento PlayerEndpoint EOS: play() again"
			);
			await kurento.player.play();
		}
	);

	await kurento.player.play();

	kurento.recorderPathPrefix = recorderPathPrefix;
}

export async function makeWebRtcEndpoint(
	recvonly: boolean = false,
	sendonly: boolean = false
): Promise<any> {
	const kurentoWebRtcEp = await kurento.pipeline.create("WebRtcEndpoint", {
		recvonly,
		sendonly,
	});
	console.log(
		`[KurentoClient] Kurento WebRtcEndpoint created, recvonly: ${recvonly}, sendonly: ${sendonly}`
	);

	kurentoWebRtcEp.on("Error", (event: any): void => {
		console.error(
			"[KurentoClient] WebRtcEndpoint ERROR %d (%s): %s",
			event.errorCode,
			event.type,
			event.description
		);
	});

	// Playback for sender mode
	// ========================

	// FIXME -- openvidu-browser will build a sendrecv PeerConnection when it
	// actually just wants a recvonly one. However, it at least does build a
	// sendonly PeerConnection when it just wants to send. So use that to
	// differentiate between both modes...
	// This will be fixed when the SDP Offer refactoring gets merged:
	// https://github.com/OpenVidu/openvidu/pull/577
	//if (!recvonly) {
	if (sendonly) {
		console.log("[KurentoClient] WebRTC sender requested");

		await kurento.player.connect(kurentoWebRtcEp);

		console.log(
			"[KurentoClient] PlayerEndpoint connected to WebRtcEndpoint"
		);
	}

	// Recording for receiver mode
	// ===========================

	const recordingEnabled = process.env.KURENTO_RECORDING_ENABLED === "true";

	if (!sendonly) {
		console.log("[KurentoClient] WebRTC receiver requested");

		if (kurento.recorderPathPrefix && recordingEnabled) {
			console.log("[KurentoClient] Recording is enabled");

			const kurentoRecorder = await kurento.pipeline.create(
				"RecorderEndpoint",
				{
					uri: `file://${
						kurento.recorderPathPrefix
					}_${new Date().getTime()}.webm`,
					stopOnEndOfStream: true,
					mediaProfile: "WEBM",
				}
			);
			kurento.recorders.push(kurentoRecorder);
			console.log(
				"[KurentoClient] Kurento RecorderEndpoint created, uri:",
				await kurentoRecorder.getUri()
			);

			kurentoRecorder.on("Error", (event: any): void => {
				console.error(
					"[KurentoClient] RecorderEndpoint ERROR %d (%s): %s",
					event.errorCode,
					event.type,
					event.description
				);
			});

			await kurentoRecorder.record();

			await kurentoWebRtcEp.connect(kurentoRecorder);

			console.log(
				"[KurentoClient] WebRtcEndpoint connected to RecorderEndpoint"
			);
		}
	}

	kurento.numWebRtcEndpoints += 1;
	if (
		kurento.numWebRtcEndpoints == 4 || // 2 peers
		kurento.numWebRtcEndpoints == 12 || // 3 peers
		kurento.numWebRtcEndpoints == 24 // 4 peers
	) {
		console.log(
			`[KurentoClient] DEBUG: ${kurento.numWebRtcEndpoints} WebRtcEndpoints: print Pipeline DOT Graph!`
		);

		const pipelineDot: string = await kurento.pipeline.getGstreamerDot();

		try {
			await writeFile(
				`pipeline_${
					kurento.numWebRtcEndpoints
				}peers_${new Date().getTime()}.dot`,
				pipelineDot
			);
		} catch (err) {
			// When a request is aborted - err is an AbortError
			console.error("[KurentoClient] ERROR:", err);
		}
	}

	return kurentoWebRtcEp;
}
