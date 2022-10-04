(<any>globalThis.window) = { console: console };
import OpenVidu = require('openvidu-browser/lib/OpenVidu/OpenVidu');
import Publisher = require('openvidu-browser/lib/OpenVidu/Publisher');
import { PublisherOverride } from './webrtc-bindings/openvidu-browser/Publisher';

const WebSocket = require('ws');
const fetch = require('node-fetch');
const LocalStorage = require('node-localstorage').LocalStorage;
import platform = require('platform');
import { EMULATED_USER_TYPE } from '../config';
import { EmulatedUserType } from '../types/config.type';

const RTCPeerConnectionWRTC = require('wrtc').RTCPeerConnection;
const RTCIceCandidateWRTC = require('wrtc').RTCIceCandidate;
const RTCSessionDescriptionWRTC = require('wrtc').RTCSessionDescription;
const mediaDevicesWRTC = require('wrtc').mediaDevices;
const MediaStreamWRTC = require('wrtc').MediaStream;
const MediaStreamTrackWRTC = require('wrtc').MediaStreamTrack;
const getUserMediaWRTC = require('wrtc').getUserMedia;

import * as KurentoWebRTC from './webrtc-bindings/kurento-webrtc/KurentoWebRTC';

export class HackService {
	constructor() {
		(<any>globalThis.navigator) = {
			userAgent: 'Node.js Testing',
		};
		(<any>globalThis.document) = {};
		(<any>globalThis.HTMLElement) = null;
		globalThis.localStorage = new LocalStorage('./');
		globalThis.fetch = fetch;
	}

	async webrtc(): Promise<void> {
		if (EMULATED_USER_TYPE === EmulatedUserType.KMS) {
			// Implement fake RTCPeerConnection methods, to get media from Kurento.

			await KurentoWebRTC.init('ws://localhost:8888/kurento');

			const globalObject = globalThis as any;
			globalObject.navigator = KurentoWebRTC.navigator;
			globalObject.MediaStream = KurentoWebRTC.MediaStream;
			globalObject.MediaStreamTrack = KurentoWebRTC.MediaStreamTrack;
			globalObject.RTCIceCandidate = KurentoWebRTC.RTCIceCandidate;
			globalObject.RTCPeerConnection = KurentoWebRTC.RTCPeerConnection;
			globalObject.RTCSessionDescription =
				KurentoWebRTC.RTCSessionDescription;
		} else {
			// Overriding WebRTC API using node-wrtc library with the aim of provide it to openvidu-browser
			// For EmulatedUserType.KMS, this is not necessary due to KMS will implement the WebRTC API itself.
			globalThis.RTCPeerConnection = RTCPeerConnectionWRTC;
			globalThis.RTCIceCandidate = RTCIceCandidateWRTC;
			globalThis.RTCSessionDescription = RTCSessionDescriptionWRTC;
			globalThis.getUserMedia = getUserMediaWRTC;
			globalThis.MediaStream = MediaStreamWRTC;
			globalThis.MediaStreamTrack = MediaStreamTrackWRTC;
			(<any>globalThis.navigator)['mediaDevices'] = mediaDevicesWRTC;
			// globalThis.navigator.mediaDevices = mediaDevicesWRTC;
		}
	}

	platform() {
		platform.name = 'Chrome';
	}

	websocket() {
		globalThis.WebSocket = WebSocket;
	}

	openviduBrowser() {
		OpenVidu.OpenVidu = ((original) => {
			OpenVidu.OpenVidu.prototype.checkSystemRequirements = () => {
				return true;
			};
			return OpenVidu.OpenVidu;
		})(OpenVidu.OpenVidu);

		Publisher.Publisher = ((original) => {
			Publisher.Publisher.prototype.initializeVideoReference =
				PublisherOverride.prototype.initializeVideoReference;
			Publisher.Publisher.prototype.getVideoDimensions =
				PublisherOverride.prototype.getVideoDimensions;
			return PublisherOverride;
		})(Publisher.Publisher);
	}

	allowSelfSignedCertificate() {
		// Allowed self signed certificate
		process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
	}
}
