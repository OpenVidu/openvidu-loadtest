export class KurentoMediaStream implements MediaStream {
    private notImplemented(): never {
        throw new Error("[KurentoMediaStream] NOT IMPLEMENTED");
    }

    // Same constructor options than in the browser:
    // https://developer.mozilla.org/en-US/docs/Web/API/MediaStream/MediaStream
    constructor(
        ...args: [] | [stream: MediaStream] | [tracks: MediaStreamTrack[]]
    ) {
        this.active = true;
        this.id = "KurentoStream_0";
        console.log(
            `[KurentoStream] constructor, active: ${this.active}, id: ${this.id}`
        );
    }

    // interface EventTarget
    // =====================

    addEventListener(): void {
        this.notImplemented();
    }

    dispatchEvent(): boolean {
        this.notImplemented();
        return true;
    }

    removeEventListener(): void {
        this.notImplemented();
    }

    // interface MediaStream
    // =====================

    readonly active: boolean;
    readonly id: string;

    onaddtrack = null;
    onremovetrack = null;

    addTrack(track: MediaStreamTrack): void {
        this.notImplemented();
    }

    clone(): MediaStream {
        this.notImplemented();
        return new KurentoMediaStream();
    }

    getAudioTracks(): MediaStreamTrack[] {
        this.notImplemented();
        return [];
    }

    getTrackById(trackId: string): MediaStreamTrack | null {
        this.notImplemented();
        return null;
    }

    getTracks(): MediaStreamTrack[] {
        this.notImplemented();
        return [];
    }

    getVideoTracks(): MediaStreamTrack[] {
        this.notImplemented();
        return [];
    }

    removeTrack(track: MediaStreamTrack): void {
        this.notImplemented();
        return;
    }
}
