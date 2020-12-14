(<any>globalThis.window) = {console: console};
import OpenVidu = require('openvidu-browser/lib/OpenVidu/OpenVidu');
import Publisher = require('openvidu-browser/lib/OpenVidu/Publisher');
const WebSocket = require("ws");
const RTCPeerConnectionWRTC = require('wrtc').RTCPeerConnection;
const RTCIceCandidateWRTC = require('wrtc').RTCIceCandidate;
const RTCSessionDescriptionWRTC = require('wrtc').RTCSessionDescription;
const mediaDevicesWRTC = require('wrtc').mediaDevices;
const MediaStreamWRTC = require('wrtc').MediaStream;
const MediaStreamTrackWRTC = require('wrtc').MediaStreamTrack;
const getUserMediaWRTC = require('wrtc').getUserMedia;
import {PublisherOverride} from '../openvidu-browser/OpenVidu/Publisher';
const LocalStorage = require('node-localstorage').LocalStorage;


export class Hack {
	constructor() {

		(<any>globalThis.navigator) = {
			userAgent: 'NodeJS Testing'
		};
		(<any>globalThis.document) = {};
		globalThis.localStorage = new LocalStorage('./');

	}

	webrtc() {

		globalThis.RTCPeerConnection = RTCPeerConnectionWRTC;
		// window['RTCPeerConnection'] = RTCPeerConnection;
		window['RTCIceCandidate'] = RTCIceCandidateWRTC;
		window['RTCSessionDescription'] = RTCSessionDescriptionWRTC;
		window['getUserMedia'] = getUserMediaWRTC;
		window['MediaStream'] = MediaStreamWRTC;
		window['MediaStreamTrack'] = MediaStreamTrackWRTC;
		(<any>globalThis.navigator)['mediaDevices'] = mediaDevicesWRTC;

	}

	websocket() {
		// selfsigned environmets will be rejected. This will only work with secure environments
		// Adding '{rejectUnauthorized: false}'  in the construcor of the WebSocket in this line
		// https://github.com/OpenVidu/openvidu/blob/c4ca3863ce183eed2083ebe78f0eafb909eea7e1/openvidu-browser/src/OpenViduInternal/KurentoUtils/kurento-jsonrpc/clients/transports/webSocketWithReconnection.js#L44
		//  selfisgned environmets will be enabled
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
}

