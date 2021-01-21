export const SERVER_PORT = process.env.SERVER_PORT || 5000;


// selfsigned environmets will be rejected. This will only work with secure environments
// Adding '{rejectUnauthorized: false}'  in the construcor of the WebSocket in this line
// https://github.com/OpenVidu/openvidu/blob/c4ca3863ce183eed2083ebe78f0eafb909eea7e1/openvidu-browser/src/OpenViduInternal/KurentoUtils/kurento-jsonrpc/clients/transports/webSocketWithReconnection.js#L44
//  selfisgned environmets will be enabled
// export const OPENVIDU_URL = process.env.OPENVIDU_URL || 'https://demos.openvidu.io';
// export const OPENVIDU_SECRET = process.env.OPENVIDU_SECRET || 'MY_SECRET';
