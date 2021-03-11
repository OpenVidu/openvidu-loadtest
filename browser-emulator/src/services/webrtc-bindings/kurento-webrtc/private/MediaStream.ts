/**
 * Partial implementation of DOM interface: Partial<MediaStream>.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

import { MediaStreamTrack } from "./MediaStreamTrack";

export class MediaStream {
    // MediaStream has 3 constructors, but I don't know how to do this
    // in TypeScript without making a mess:
    // https://developer.mozilla.org/en-US/docs/Web/API/MediaStream/MediaStream
    // constructor();
    // constructor(stream: MediaStream);
    // constructor(tracks: MediaStreamTrack[]);

    constructor(private tracks: MediaStreamTrack[]) {}

    public getAudioTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === "audio");
    }

    public getVideoTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === "video");
    }

    public getTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
}
