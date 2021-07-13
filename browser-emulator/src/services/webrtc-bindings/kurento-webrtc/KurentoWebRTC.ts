export { init, setPlayerEndpointPath, setRecorderEndpointPrefix, clean } from './private/KurentoClient';

import { Navigator } from './private/Navigator';
export const navigator = new Navigator();

export { MediaStream } from './private/MediaStream';
export { MediaStreamTrack } from './private/MediaStreamTrack';
export { RTCIceCandidate } from './private/RTCIceCandidate';
export { RTCPeerConnection } from './private/RTCPeerConnection';
export { RTCSessionDescription } from './private/RTCSessionDescription';
