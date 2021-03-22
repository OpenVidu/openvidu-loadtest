import { Publisher, VideoInsertMode, PublisherProperties, OpenVidu } from 'openvidu-browser';
// TODO: CREATE NEW ONE ?
import { MediaStream } from '../../../services/webrtc-bindings/kurento-webrtc/KurentoWebRTC';

interface HTMLElement {

}
interface MediaTrackSettings {
  height?: number;
  width?: number;
}

export class PublisherOverride extends Publisher {
  constructor(targEl: string | HTMLElement, properties: PublisherProperties, openvidu: OpenVidu) {
    super(targEl, properties, openvidu);
  }

  initializeVideoReference(mediaStream: MediaStream) {
    this.stream.setMediaStream(mediaStream);

    if (!!this.firstVideoElement) {
      this.createVideoElement(this.firstVideoElement.targetElement, <VideoInsertMode>this.properties.insertMode);
    }
  }

  getVideoDimensions(mediaStream: MediaStream): MediaTrackSettings {
       return { height: 480, width: 640 };
  }
}