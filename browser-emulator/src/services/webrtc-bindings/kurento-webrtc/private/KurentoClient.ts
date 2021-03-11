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

    // DOESN'T WORK?
    kurentoClient = await KurentoClient.getSingleton(kurentoUrl);
    // kurentoClient is still undefined
    // kurentoClient = new KurentoClient(kurentoUrl);
    console.log("[KurentoClient] Kurento client connected");

    kurentoPipeline = await kurentoClient.create("MediaPipeline");
    console.log("[KurentoClient] Kurento MediaPipeline created");

    kurentoPlayerEp = await kurentoPipeline.create("PlayerEndpoint", {
        uri: `file://${filePath}`,
    });
    console.log(
        "[KurentoClient] Kurento PlayerEndpoint created, uri:",
        await kurentoPlayerEp.getUri()
    );
}

export async function makeWebRtcEndpoint(
    recvonly: boolean,
    sendonly: boolean
): Promise<any> {
    const kurentoWebRtcEp = await kurentoPipeline.create("WebRtcEndpoint", {
        recvonly,
        sendonly,
    });
    console.log("[KurentoClient] Kurento WebRtcEndpoint created");

    await kurentoPlayerEp.connect(kurentoWebRtcEp);
    console.log("[KurentoClient] PlayerEndpoint connected to WebRtcEndpoint");

    return kurentoWebRtcEp;
}
