(<any>globalThis.window) = {console: console};
import OpenVidu = require('openvidu-browser/lib/OpenVidu/OpenVidu');
import Publisher = require('openvidu-browser/lib/OpenVidu/Publisher');
import {PublisherOverride} from '../extra/openvidu-browser/OpenVidu/Publisher';

const WebSocket = require("ws");
const fetch = require("node-fetch");
const LocalStorage = require('node-localstorage').LocalStorage;
import platform = require('platform');
import { EMULATED_USER_TYPE } from '../config';
import { EmulatedUserType } from '../types/emulated-user.type';

const RTCPeerConnectionWRTC = require('wrtc').RTCPeerConnection;
const RTCIceCandidateWRTC = require('wrtc').RTCIceCandidate;
const RTCSessionDescriptionWRTC = require('wrtc').RTCSessionDescription;
const mediaDevicesWRTC = require('wrtc').mediaDevices;
const MediaStreamWRTC = require('wrtc').MediaStream;
const MediaStreamTrackWRTC = require('wrtc').MediaStreamTrack;
const getUserMediaWRTC = require('wrtc').getUserMedia;

export class HackService {
	constructor() {

		(<any>globalThis.navigator) = {
			userAgent: 'Node.js Testing'
		};
		(<any>globalThis.document) = {};
		globalThis.localStorage = new LocalStorage('./');
		globalThis.fetch = fetch;
	}

	webrtc() {
		if(EMULATED_USER_TYPE === EmulatedUserType.NODE_WEBRTC) {
			// Overriding WebRTC API using node-wrtc library with the aim of provide it to openvidu-browser
			// For EmulatedUserType.KMS, this is not necessary due to KMS will implement the WebRTC API itself.
			globalThis.RTCPeerConnection = RTCPeerConnectionWRTC;
			globalThis.RTCIceCandidate = RTCIceCandidateWRTC;
			globalThis.RTCSessionDescription = RTCSessionDescriptionWRTC;
			globalThis.getUserMedia = getUserMediaWRTC;
			globalThis.MediaStream = MediaStreamWRTC;
			globalThis.MediaStreamTrack = MediaStreamTrackWRTC;
			(<any>globalThis.navigator)['mediaDevices'] = mediaDevicesWRTC;
		} else {
			// Overriding peerConnection methods for getting media from KMS

		}
	}

	platform() {
		platform.name = 'Chrome';
	}

	websocket() {
		globalThis.WebSocket = WebSocket;
	}

	openviduBrowser(){

		OpenVidu.OpenVidu = ((original) => {
			OpenVidu.OpenVidu.prototype.checkSystemRequirements = () => {return 1};
			return OpenVidu.OpenVidu;
		})(OpenVidu.OpenVidu);

		Publisher.Publisher = ((original) => {
			Publisher.Publisher.prototype.initializeVideoReference = PublisherOverride.prototype.initializeVideoReference;
			Publisher.Publisher.prototype.getVideoDimensions = PublisherOverride.prototype.getVideoDimensions;
			return PublisherOverride;
		})(Publisher.Publisher);
	}

	allowSelfSignedCertificate(){
		// Allowed self signed certificate
		process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = '0';
	}
}

