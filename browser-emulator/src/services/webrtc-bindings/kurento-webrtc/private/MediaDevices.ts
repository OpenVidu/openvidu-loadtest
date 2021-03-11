/**
 * Partial implementation of DOM interface: Partial<MediaDevices>.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

import { MediaStream } from "./MediaStream";
import { MediaStreamTrack } from "./MediaStreamTrack";

export class MediaDevices {
    public async getUserMedia(
        constraints?: MediaStreamConstraints
    ): Promise<MediaStream> {
        const tracks: MediaStreamTrack[] = [];

        if (constraints) {
            if (constraints.audio) {
                tracks.push({ kind: "audio" });
            }
            if (constraints.video) {
                tracks.push({ kind: "video" });
            }
        } else {
            tracks.push({ kind: "audio" });
            tracks.push({ kind: "video" });
        }

        const stream = new MediaStream(tracks);
        return stream;
    }
}
