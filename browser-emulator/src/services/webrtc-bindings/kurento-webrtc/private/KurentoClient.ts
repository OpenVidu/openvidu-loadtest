import * as KurentoClient from 'kurento-client';
import { writeFile } from 'fs/promises';
import { APPLICATION_MODE } from '../../../../config';
import { ApplicationMode } from '../../../../types/config.type';

export { getComplexType } from 'kurento-client';

const kurento = {
	client: null,
	pipeline: null,
	player: null,
	recorders: [],
	recorderPathPrefix: '',

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
export async function init(kurentoUrl: string): Promise<void> {
	console.log(
		'[KurentoClient] Connect with Kurento Media Server:',
		kurentoUrl
	);
	try {
		kurento.client = await KurentoClient.getSingleton(kurentoUrl);
		console.log('[KurentoClient] Kurento client connected');

		kurento.pipeline = await kurento.client.create('MediaPipeline');
		console.log('[KurentoClient] Kurento MediaPipeline created');

		kurento.pipeline.on('Error', (event: any): void => {
			console.error(
				'[KurentoClient] MediaPipeline ERROR %d (%s): %s',
				event.errorCode,
				event.type,
				event.description
			);
		});
	} catch (error) {
		throw error;
	}
}

export async function setPlayerEndpointPath(videoUri: string) {
	if (!kurento.player) {
		kurento.player = await kurento.pipeline.create('PlayerEndpoint', {
			uri: `file://${videoUri}`,
			useEncodedMedia: true,
		});

		console.log(
			'[KurentoClient] Kurento PlayerEndpoint created, uri:',
			await kurento.player.getUri()
		);

		kurento.player.on('Error', (event: any): void => {
			console.error(
				'[KurentoClient] PlayerEndpoint ERROR %d (%s): %s',
				event.errorCode,
				event.type,
				event.description
			);
		});

		kurento.player.on(
			'EndOfStream',
			async (_event: any): Promise<void> => {
				if (kurento.player) {
					console.log(
						'[KurentoClient] PlayerEndpoint End Of Stream: play() again'
					);
					await kurento.player.stop();
					await kurento.player.play();
				}
			}
		);
	}
}

export function setRecorderEndpointPrefix(recorderPathPrefix: string | undefined = undefined) {
	kurento.recorderPathPrefix = recorderPathPrefix;
}

export async function clean() {
	if(kurento && kurento.player){
		await kurento.player.stop();
		kurento.player = null;
	}
}

export async function makeWebRtcEndpoint(
	recvonly: boolean = false,
	sendonly: boolean = false
): Promise<any> {
	let kurentoWebRtcEp: any;
	try {
		kurentoWebRtcEp = await kurento.pipeline.create('WebRtcEndpoint', {
			recvonly,
			sendonly,
		});

		console.log(
			`[KurentoClient] Kurento WebRtcEndpoint created, recvonly: ${recvonly}, sendonly: ${sendonly}`
		);

		kurentoWebRtcEp.on('Error', (event: any): void => {
			console.error(
				'[KurentoClient] WebRtcEndpoint ERROR %d (%s): %s',
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
			console.log('[KurentoClient] WebRTC sender requested');

			await kurento.player.connect(kurentoWebRtcEp);

			console.log(
				'[KurentoClient] PlayerEndpoint connected to WebRtcEndpoint'
			);

			// First time, start the playback.
			const playerState: string = await kurento.player.getState();
			if (playerState !== 'START') {
				console.log('[KurentoClient] Kurento PlayerEndpoint: play()');
				await kurento.player.play();
			}
		}

		// Recording for receiver mode
		// ===========================

		const recordingEnabled = process.env.KURENTO_RECORDING_ENABLED === 'true';

		if (!sendonly) {
			console.log('[KurentoClient] WebRTC receiver requested');

			if (kurento.recorderPathPrefix && recordingEnabled) {
				console.log('[KurentoClient] Recording is enabled');

				const kurentoRecorder = await kurento.pipeline.create(
					'RecorderEndpoint',
					{
						uri: `file://${kurento.recorderPathPrefix}.webm`,
						stopOnEndOfStream: true,
						mediaProfile: 'WEBM',
					}
				);
				kurento.recorders.push(kurentoRecorder);
				console.log(
					'[KurentoClient] Kurento RecorderEndpoint created, uri:',
					await kurentoRecorder.getUri()
				);

				kurentoRecorder.on('Error', (event: any): void => {
					console.error(
						'[KurentoClient] RecorderEndpoint ERROR %d (%s): %s',
						event.errorCode,
						event.type,
						event.description
					);
				});

				await kurentoRecorder.record();

				await kurentoWebRtcEp.connect(kurentoRecorder);

				console.log(
					'[KurentoClient] WebRtcEndpoint connected to RecorderEndpoint'
				);
			}
		}

		if (APPLICATION_MODE === ApplicationMode.DEV) {
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
					console.error('[KurentoClient] ERROR:', err);
				}
			}
		}

		return kurentoWebRtcEp;
	} catch (error) {
		throw error;
	}
}
