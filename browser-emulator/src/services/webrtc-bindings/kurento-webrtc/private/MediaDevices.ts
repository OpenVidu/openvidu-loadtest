/**
 * Partial DOM type implementation: `Partial<MediaDevices>`.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

import { MediaStream } from './MediaStream';
import { MediaStreamTrack } from './MediaStreamTrack';

// interface MediaTrackConstraintSet {
//     aspectRatio?: ConstrainDouble;
//     autoGainControl?: ConstrainBoolean;
//     channelCount?: ConstrainULong;
//     deviceId?: ConstrainDOMString;
//     echoCancellation?: ConstrainBoolean;
//     facingMode?: ConstrainDOMString;
//     frameRate?: ConstrainDouble;
//     groupId?: ConstrainDOMString;
//     height?: ConstrainULong;
//     latency?: ConstrainDouble;
//     noiseSuppression?: ConstrainBoolean;
//     resizeMode?: ConstrainDOMString;
//     sampleRate?: ConstrainULong;
//     sampleSize?: ConstrainULong;
//     width?: ConstrainULong;
// }

// interface MediaTrackConstraints extends MediaTrackConstraintSet {
//     advanced?: MediaTrackConstraintSet[];
// }

interface MediaStreamConstraints {
	audio?: boolean; // | MediaTrackConstraints;
	peerIdentity?: string;
	video?: boolean; // | MediaTrackConstraints;
}

export class MediaDevices {
	public async getUserMedia(constraints?: MediaStreamConstraints): Promise<MediaStream> {
		const tracks: MediaStreamTrack[] = [];

		if (constraints) {
			if (constraints.audio) {
				tracks.push(new MediaStreamTrack({ kind: 'audio' }));
			}
			if (constraints.video) {
				tracks.push(new MediaStreamTrack({ kind: 'video' }));
			}
		} else {
			tracks.push(new MediaStreamTrack({ kind: 'audio' }));
			tracks.push(new MediaStreamTrack({ kind: 'video' }));
		}

		const stream = new MediaStream(tracks);
		return stream;
	}
}
