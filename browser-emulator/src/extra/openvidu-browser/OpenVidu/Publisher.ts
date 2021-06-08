import { Publisher, VideoInsertMode, PublisherProperties, OpenVidu } from 'openvidu-browser';

interface MediaTrackSettings {
  height: number;
  width: number;
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

  async getVideoDimensions(mediaStream: MediaStream): Promise<MediaTrackSettings> {
    const constraints = <any>mediaStream.getVideoTracks()[0]?.getConstraints();
    return { width: constraints.width || 480, height: constraints.height || 640 };
  }
}