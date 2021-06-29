import { MediaStreamTracksResponse } from '../../types/emulate-webrtc.type';

export interface IEmulateWebrtc {
	createMediaStreamTracks(video: boolean, audio: boolean): Promise<MediaStreamTracksResponse>;
	clean(): void;
}
