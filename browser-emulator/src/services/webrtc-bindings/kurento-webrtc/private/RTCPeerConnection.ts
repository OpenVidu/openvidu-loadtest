/**
 * Partial DOM type implementation: `Partial<RTCPeerConnection>`.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

import * as KurentoClient from './KurentoClient';

import { Event } from './Event';
import { MediaStream } from './MediaStream';
import { MediaStreamTrack } from './MediaStreamTrack';
import { RTCIceCandidate } from './RTCIceCandidate';
import { RTCIceCandidateInit } from './RTCIceCandidate';
import { RTCRtpSender } from './RTCRtpSender';
import { RTCSessionDescription } from './RTCSessionDescription';
import { RTCSessionDescriptionInit } from './RTCSessionDescription';

import { EventEmitter } from 'events';

interface RTCConfiguration {}

interface RTCOfferOptions {
	offerToReceiveAudio?: boolean;
	offerToReceiveVideo?: boolean;
}

class RTCPeerConnectionIceEvent extends Event {
	readonly candidate: RTCIceCandidate | null = null;
	readonly url: string | null = null;

	constructor(type: string, initDict: Partial<RTCPeerConnectionIceEvent> = {}) {
		super(type);
		Object.assign(this, initDict);
	}
}

type RTCSignalingState = 'closed' | 'have-local-offer' | 'have-local-pranswer' | 'have-remote-offer' | 'have-remote-pranswer' | 'stable';

interface RTCStats {
	id: string;
	timestamp: number;
	type: RTCStatsType;
}

type RTCStatsType =
	| 'candidate-pair'
	| 'certificate'
	| 'codec'
	| 'csrc'
	| 'data-channel'
	| 'ice-server'
	| 'inbound-rtp'
	| 'local-candidate'
	| 'media-source'
	| 'outbound-rtp'
	| 'peer-connection'
	| 'receiver'
	| 'remote-candidate'
	| 'remote-inbound-rtp'
	| 'remote-outbound-rtp'
	| 'sctp-transport'
	| 'sender'
	| 'stream'
	| 'track'
	| 'transceiver'
	| 'transport';

interface RTCStatsReport {
	// forEach(callbackfn: (value: any, key: string, parent: RTCStatsReport) => void, thisArg?: any): void;
}

export class RTCPeerConnection extends EventEmitter {
	private tracks: MediaStreamTrack[] = [];
	private kurentoWebRtcEp: any = null;

	private async makeWebRtcEndpoint(recvonly: boolean = false, sendonly: boolean = false): Promise<any> {
		if (this.kurentoWebRtcEp) {
			throw new Error('BUG: Multiple WebRtcEndpoints would be created');
		}

		const kurentoWebRtcEp = await KurentoClient.makeWebRtcEndpoint(recvonly, sendonly);

		kurentoWebRtcEp.on('IceCandidateFound', this.onKurentoIceCandidate);

		return kurentoWebRtcEp;
	}

	private onKurentoIceCandidate(event: any): void {
		const kurentoCandidate = new KurentoClient.getComplexType('IceCandidate')(event.candidate);

		// https://www.w3.org/TR/webrtc/#dom-rtcpeerconnectioniceevent
		const iceEvent = new RTCPeerConnectionIceEvent('icecandidate', {
			candidate: new RTCIceCandidate({
				candidate: kurentoCandidate.candidate,
				sdpMLineIndex: kurentoCandidate.sdpMLineIndex,
				sdpMid: kurentoCandidate.sdpMid,
			}),
		});

		// console.debug("DEBUG [RTCPeerConnection.onKurentoIceCandidate] iceEvent:", iceEvent);

		this.emit(iceEvent.type, iceEvent);
		if (this.onicecandidate) {
			this.onicecandidate(iceEvent);
		}
	}

	// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection
	constructor(configuration?: RTCConfiguration) {
		super();
	}

	public localDescription: RTCSessionDescription | null = null;
	public remoteDescription: RTCSessionDescription | null = null;

	// https://www.w3.org/TR/webrtc/#dom-rtcsignalingstate
	private _signalingState: RTCSignalingState = 'stable';

	public get signalingState(): RTCSignalingState {
		return this._signalingState;
	}

	public set signalingState(value: RTCSignalingState) {
		if (this._signalingState === value) {
			return;
		}

		this._signalingState = value;

		const event = new Event('signalingstatechange');

		// console.debug(`DEBUG [RTCPeerConnection set signalingState] Emit event: ${event}, state: ${this.signalingState}`);

		this.emit(event.type, event);
		if (this.onsignalingstatechange) {
			this.onsignalingstatechange(event);
		}
	}

	public onicecandidate: ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => any) | null = null;
	public onsignalingstatechange: ((this: RTCPeerConnection, ev: Event) => any) | null = null;

	public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
		// console.debug("DEBUG [RTCPeerConnection.addIceCandidate] candidate:", candidate);

		if (!this.kurentoWebRtcEp) {
			throw new Error("BUG: Kurento WebRtcEndpoint doesn't exist");
		}

		const kurentoCandidate = new KurentoClient.getComplexType('IceCandidate')(candidate);
		await this.kurentoWebRtcEp.addIceCandidate(kurentoCandidate);
	}

	public addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
		this.tracks.push(track);

		return { track };
	}

	public close(): void {
		this.signalingState = 'closed';

		this.kurentoWebRtcEp.release();
		delete this.kurentoWebRtcEp;
	}

	public async createAnswer(_options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
		// This should be the first and only WebRtcEndpoint.
		// Force it to be a recvonly endpoint (because we know that an Answer
		// will only be requested from one that doesn't need to send).
		this.kurentoWebRtcEp = await this.makeWebRtcEndpoint(true, false);

		// Kurento returns an SDP Answer, based on the remote Offer.
		const sdpAnswer = await this.kurentoWebRtcEp.processOffer(this.remoteDescription.sdp);

		// Start ICE candidate gathering on Kurento.
		// console.debug("DEBUG [RTCPeerConnection.createAnswer] Kurento WebRtcEndpoint gatherCandidates()");
		await this.kurentoWebRtcEp.gatherCandidates();

		return {
			sdp: sdpAnswer,
			type: 'answer',
		};
	}

	public async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
		// Offer to send if either an audio or video track has been added.
		const sendAudio = this.tracks.some((track) => track.kind === 'audio');
		const sendVideo = this.tracks.some((track) => track.kind === 'video');
		const offerToSend = sendAudio || sendVideo;

		// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer
		// The default behavior is to offer to receive only if the local side is
		// sending, not otherwise.
		let offerToReceive = offerToSend;
		if (options && options.offerToReceiveAudio === false && options.offerToReceiveVideo === false) {
			offerToReceive = false;
		}

		const recvonly = offerToReceive && !offerToSend;
		const sendonly = offerToSend && !offerToReceive;

		// This should be the first and only WebRtcEndpoint.
		this.kurentoWebRtcEp = await this.makeWebRtcEndpoint(recvonly, sendonly);

		const offerAudio = sendAudio || options.offerToReceiveAudio;
		const offerVideo = sendVideo || options.offerToReceiveVideo;

		let sdpOffer: string;
		if (offerAudio && offerVideo) {
			// Default behavior.
			sdpOffer = await this.kurentoWebRtcEp.generateOffer();
		} else {
			sdpOffer = await this.kurentoWebRtcEp.generateOffer(
				new KurentoClient.getComplexType('OfferOptions')({
					// FIXME: These names are misleading! The API is wrong, and
					// they should be just "offerAudio", "offerVideo".
					offerToReceiveAudio: offerAudio,
					offerToReceiveVideo: offerVideo,
				})
			);
		}

		// Start ICE candidate gathering on Kurento.
		// console.debug("DEBUG [RTCPeerConnection.createOffer] Kurento WebRtcEndpoint gatherCandidates()");
		await this.kurentoWebRtcEp.gatherCandidates();

		return {
			sdp: sdpOffer,
			type: 'offer',
		};
	}

	// Returns a RTCStatsReport with RTCStats objects as defined for WebRTC:
	// https://www.w3.org/TR/webrtc-stats/
	public async getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport> {
		const statsReport = new Map<string, any>();
		let kurentoStatsReport: any;
		for (const kind of ['audio', 'video']) {
			if (!selector || selector.kind === kind) {
				try {
					kurentoStatsReport = await this.kurentoWebRtcEp.getStats(kind.toUpperCase());
				} catch (error) {
					console.error('Error getting stats ', error)
					throw error;
				}

				if (!kurentoStatsReport) {
					continue;
				}

				// A stats report is a Map<string, stats>.
				const kurentoStatsValues: any[] = Object.values(kurentoStatsReport);

				for (const kurentoStats of kurentoStatsValues) {
					// Convert the Kurento stats into a valid RTCStats.
					let stats: RTCStats = {
						id: kurentoStats.id,
						timestamp: kurentoStats.timestampMillis,
						type: 'inbound-rtp', // Dummy value.
					};
					// Creating candidate pair stats because of the official documentation includes RTT and remb
					// inside of RTCIceCandidatePairStats but Kurento contradicts it adding them inside of outbound-rtp stats
					// https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidatePairStats
					let pairStats: RTCStats = {
						id: kurentoStats.id,
						timestamp: kurentoStats.timestampMillis,
						type: 'candidate-pair',
					};

					// Possible types taken from `kms-core/src/server/interface/core.kmd.json`.
					switch (kurentoStats.type) {
						case 'inboundrtp':
							stats.type = 'inbound-rtp';

							// KMS stats don't include the media kind...
							stats['kind'] = kind;

							// Other stats required by openvidu-browser.
							stats['framesDecoded'] = -1;
							stats['jitterBufferDelay'] = -1;

							break;
						case 'outboundrtp':
							stats.type = 'outbound-rtp';

							// KMS stats don't include the media kind...
							stats['kind'] = kind;

							// Other stats required by openvidu-browser.
							stats['framesEncoded'] = -1;
							stats['qpSum'] = -1;

							break;
						case 'session':
							break;
						case 'datachannel':
							stats.type = 'data-channel';
							break;
						case 'track':
						case 'transport':
							stats.type = kurentoStats.type;
							break;
						case 'candidatepair':
							stats.type = 'candidate-pair';
							break;
						case 'localcandidate':
							stats.type = 'local-candidate';
							break;
						case 'remotecandidate':
							stats.type = 'remote-candidate';
							break;
						case 'element':
							break;
						case 'endpoint':
							// TODO - For now, ignore Kurento-specific E2E stats.
							continue;
							break;
					}

					// Assign all other values directly from the Kurento stats to
					// our RTCStats object. This will (SHOULD) work because Kurento
					// stats have the same names than standard ones.
					for (const [key, value] of Object.entries(kurentoStats)) {
						// Exclude properties from the base RTCStats type.
						if (['id', 'timestamp', 'type'].includes(key)) {
							continue;
						}
						if (key === 'roundTripTime') {
							pairStats['currentRoundTripTime'] = value;
						} else if (key === 'remb') {
							pairStats['availableOutgoingBitrate'] = value;
						} else {
							stats[key] = value;
						}
					}

					statsReport.set(`Kurento_${stats.type}_${kind}`, stats);
					if ('currentRoundTripTime' in pairStats || 'availableOutgoingBitrate' in pairStats) {
						// @ts-ignore - Compiler is too clever and thinks this branch will never execute.
						statsReport.set(`Kurento_${pairStats.type}_${kind}`, pairStats);
					}
				}
			}
		}

		return statsReport;
	}

	public async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
		// Update signaling state.
		// https://www.w3.org/TR/webrtc/#dom-rtcsignalingstate
		if (this.signalingState === 'stable' && description.type === 'offer') {
			this.signalingState = 'have-local-offer';
		} else if (this.signalingState === 'have-remote-offer' && description.type === 'answer') {
			this.signalingState = 'stable';
		} else {
			throw new Error(
				`Bad signaling, state '${this.signalingState}' doesn't accept local descriptions of type '${description.type}'`
			);
		}
		this.localDescription = description;
	}

	/*
    Throws:
    - SDP_PARSE_ERROR If the offer is empty or has errors.
    - SDP_END_POINT_ALREADY_NEGOTIATED If the endpoint is already negotiated.
    - SDP_END_POINT_PROCESS_ANSWER_ERROR if the result of processing the answer
      an empty string. This is most likely due to an internal error.
    - SDP_END_POINT_NOT_OFFER_GENERATED If the method is invoked before the
      generateOffer method.
    */
	public async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
		// Update signaling state.
		// https://www.w3.org/TR/webrtc/#dom-rtcsignalingstate
		if (this.signalingState === 'stable' && description.type === 'offer') {
			this.signalingState = 'have-remote-offer';
		} else if (this.signalingState === 'have-local-offer' && description.type === 'answer') {
			// Kurento returns an updated SDP Offer, based on the remote Answer.
			const sdpOffer = await this.kurentoWebRtcEp.processAnswer(description.sdp);
			this.localDescription = {
				sdp: sdpOffer,
				type: 'offer',
			};

			this.signalingState = 'stable';
		} else {
			throw new Error(
				`Bad signaling, state '${this.signalingState}' doesn't accept remote descriptions of type '${description.type}'`
			);
		}
		this.remoteDescription = description;
	}

	// Methods from parent interface EventTarget.
	// FIXME: This should just come from extending Noede.js's EventTarget class,
	// but that class is not yet available in Node.js v14 (it is in v15).
	public addEventListener(type: string | symbol, listener: (...args: any[]) => void): void {
		this.on(type, listener);
	}
}
