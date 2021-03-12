import * as KurentoClient from "kurento-client";

export { getComplexType } from "kurento-client";

let kurentoClient: any;
let kurentoPipeline: any;
let kurentoPlayerEp: any;

export async function init(
    kurentoUrl: string,
    filePath: string = "/tmp/video.mp4"
): Promise<void> {
    console.log(
        "[KurentoClient] Connect with Kurento Media Server:",
        kurentoUrl
    );

    kurentoClient = await KurentoClient.getSingleton(kurentoUrl);
    console.log("[KurentoClient] Kurento client connected");

    kurentoPipeline = await kurentoClient.create("MediaPipeline");
    console.log("[KurentoClient] Kurento MediaPipeline created");

    kurentoPlayerEp = await kurentoPipeline.create("PlayerEndpoint", {
        uri: `file://${filePath}`,

        useEncodedMedia: false,
        // useEncodedMedia: true,
    });
    console.log(
        "[KurentoClient] Kurento PlayerEndpoint created, uri:",
        await kurentoPlayerEp.getUri()
    );
}

export async function makeWebRtcEndpoint(
    recvonly: boolean = false,
    sendonly: boolean = false
): Promise<any> {
    const kurentoWebRtcEp = await kurentoPipeline.create("WebRtcEndpoint", {
        recvonly,
        sendonly,
    });
    console.log(
        `[KurentoClient] Kurento WebRtcEndpoint created, recvonly: ${recvonly}, sendonly: ${sendonly}`
    );

    await kurentoPlayerEp.connect(kurentoWebRtcEp);
    console.log("[KurentoClient] PlayerEndpoint connected to WebRtcEndpoint");

    await kurentoPlayerEp.play();

    return kurentoWebRtcEp;
}
