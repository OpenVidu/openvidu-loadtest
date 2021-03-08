import { KurentoMediaDevices } from "./MediaDevices";

export class KurentoNavigator implements Partial<Navigator> {
    // interface NavigatorID
    // =====================
    readonly userAgent: string = "Kurento-WebRTC";

    // interface Navigator
    // ===================
    readonly mediaDevices: MediaDevices = new KurentoMediaDevices();
}
