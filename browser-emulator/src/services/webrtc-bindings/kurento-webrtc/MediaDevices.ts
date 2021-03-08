import { KurentoMediaStream } from "./MediaStream";

export class KurentoMediaDevices implements MediaDevices {
    private notImplemented(): never {
        throw new Error("[KurentoMediaDevices] NOT IMPLEMENTED");
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

    // interface MediaDevices
    // ======================

    ondevicechange = null;

    async enumerateDevices(): Promise<MediaDeviceInfo[]> {
        this.notImplemented();
        return [];
    }

    getSupportedConstraints(): MediaTrackSupportedConstraints {
        this.notImplemented();
        return {};
    }

    async getUserMedia(
        constraints?: MediaStreamConstraints
    ): Promise<MediaStream> {
        this.notImplemented();
        const stream = new KurentoMediaStream();
        return stream;
    }
}
