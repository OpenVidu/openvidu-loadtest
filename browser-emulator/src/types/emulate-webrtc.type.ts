import { MediaStreamTrack } from "wrtc";

export interface MediaStreamTracksResponse {
	audioTrack: MediaStreamTrack;
	videoTrack: MediaStreamTrack;
	audioTrackInterval?: NodeJS.Timer;
}
