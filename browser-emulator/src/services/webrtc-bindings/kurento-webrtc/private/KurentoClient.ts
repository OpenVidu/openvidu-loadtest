import * as KurentoClient from "kurento-client";
import { send } from "process";

export { getComplexType } from "kurento-client";

const kurento = {
    client: null,
    pipeline: null,
    player: null,
    recorders: [],
    recorderPathPrefix: "",
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
    playerPath: string = "/tmp/video.mp4",
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

    kurento.player = await kurento.pipeline.create("PlayerEndpoint", {
        uri: `file://${playerPath}`,

        useEncodedMedia: false,
        // useEncodedMedia: true,
    });
    console.log(
        "[KurentoClient] Kurento PlayerEndpoint created, uri:",
        await kurento.player.getUri()
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

    // Playback for sender mode
    // ========================

    if (!recvonly) {
        console.log(
            "[KurentoClient] Not a pure WebRTC receiver: send from PlayerEndpoint"
        );

        await kurento.player.connect(kurentoWebRtcEp);

        console.log(
            "[KurentoClient] PlayerEndpoint connected to WebRtcEndpoint"
        );
    }

    // Recording for receiver mode
    // ===========================

    const recordingEnabled = process.env.KURENTO_RECORDING_ENABLED === "true";

    if (!sendonly && kurento.recorderPathPrefix && recordingEnabled) {
        console.log(
            "[KurentoClient] Not a pure WebRTC sender: receive into a RecorderEndpoint"
        );

        const kurentoRecorder = await kurento.pipeline.create(
            "RecorderEndpoint",
            {
                uri: `file://${kurento.recorderPathPrefix}_${new Date().getTime()}.webm`,
                stopOnEndOfStream: true,
                mediaProfile: "WEBM",
            }
        );
        kurento.recorders.push(kurentoRecorder);
        console.log(
            "[KurentoClient] Kurento RecorderEndpoint created, uri:",
            await kurentoRecorder.getUri()
        );

        await kurentoRecorder.record();

        await kurentoWebRtcEp.connect(kurentoRecorder);

        console.log(
            "[KurentoClient] WebRtcEndpoint connected to RecorderEndpoint"
        );
    }

    return kurentoWebRtcEp;
}
