import { ConnectionEvent, OpenVidu, Publisher, Session, SessionDisconnectedEvent, StreamEvent, StreamManager } from 'openvidu-browser';
import { HttpClient } from '../utils/http-client';
import { OpenViduRole } from '../types/openvidu.type';
import { TestProperties } from '../types/api-rest.type';

import { MediaStreamTrack } from 'wrtc';

import { EMULATED_USER_TYPE } from '../config';
import { EmulatedUserType } from '../types/config.type';
import { CanvasService } from './emulated/canvas.service';
import { FfmpegService } from './emulated/ffmpeg.service';
import { MediaStreamTracksResponse } from '../types/emulate-webrtc.type';
import { ExceptionEvent } from 'openvidu-browser/lib/OpenViduInternal/Events/ExceptionEvent';
import { WsService } from './ws.service';

import * as KurentoWebRTC from './webrtc-bindings/kurento-webrtc/KurentoWebRTC';

export class EmulateBrowserService {
	private openviduMap: Map<string, { openvidu: OpenVidu; session: Session; audioTrackInterval: NodeJS.Timer }> = new Map();
	private connections: Map<string, { publishers: string[]; subscribers: string[] }> = new Map();
	private exceptionFound: boolean = false;
	private exceptionMessage: string = '';
	private readonly KMS_MEDIAFILES_PATH = '/home/ubuntu/mediafiles';
	private readonly KMS_RECORDINGS_PATH = '/home/ubuntu/recordings';
	private totalPublishers: number = 0;

	// TODO: Implement QoE Analysis
	// TODO: Use new videos
	constructor(
		private httpClient: HttpClient = new HttpClient(),
		private nodeWebrtcService: CanvasService | FfmpegService = null,
		private wsService: WsService = WsService.getInstance()
	) {
		if (this.isUsingNodeWebrtcCanvas()) {
			this.nodeWebrtcService = new CanvasService();
		} else if (this.isUsingNodeWebrtcFfmpeg()) {
			this.nodeWebrtcService = new FfmpegService();
		}
	}

	async createStreamManager(token: string, properties: TestProperties): Promise<string> {
		return new Promise(async (resolve, reject) => {
			let session: Session = null;
			try {
				if (this.exceptionFound) {
					throw { status: 500, message: this.exceptionMessage };
				}

				if (!token) {
					token = await this.getToken(properties);
				}

				let mediaStreamTracks: MediaStreamTracksResponse;
				const ov: OpenVidu = new OpenVidu();
				ov.enableProdMode();
				session = ov.initSession();
				this.subscriberToSessionsEvents(session);

				await session.connect(token, { clientData: `${EMULATED_USER_TYPE}_${properties.userId}` });
				let currentPublishers = 0;
				session.streamManagers.forEach((sm: StreamManager) => {
					if (sm.stream.connection.role === OpenViduRole.PUBLISHER) {
						currentPublishers;
					}
				})
				this.totalPublishers = currentPublishers;
				if (properties.role === OpenViduRole.PUBLISHER) {
					mediaStreamTracks = await this.createMediaStreamTracks(properties);

					const publisher: Publisher = ov.initPublisher(null, {
						audioSource: mediaStreamTracks.audioTrack,
						videoSource: mediaStreamTracks.videoTrack,
						publishAudio: properties.audio,
						publishVideo: properties.video,
						resolution: properties.resolution,
						frameRate: properties.frameRate,
					});

					this.subscriberToPublisherEvents(publisher);
					await session.publish(publisher);
					this.totalPublishers++;
				}

				this.storeInstances(ov, session, mediaStreamTracks?.audioTrackInterval);
				this.storeConnection(session.connection.connectionId, properties);
				resolve(session.connection.connectionId);
			} catch (error) {
				if(session?.sessionConnected()) {
					session.disconnect();
				}
				console.log('There was an error connecting to the session:', error);
				reject({ status: error?.status, message: error?.statusText || error?.message || error });
			}
		});
	}

	deleteStreamManagerWithConnectionId(connectionId: string): void {
		const value = this.openviduMap.get(connectionId);
		if(!!value) {
			const { session, audioTrackInterval } = value
			session?.disconnect();
			clearInterval(audioTrackInterval);
			this.openviduMap.delete(connectionId);
		}
	}

	deleteStreamManagerWithRole(role: OpenViduRole) {
		const connectionsToDelete = [];
		this.openviduMap.forEach(
			(value: { session: Session; openvidu: OpenVidu; audioTrackInterval: NodeJS.Timer }, connectionId: string) => {
				if (value.session.connection.role === role) {
					value.session.disconnect();
					clearInterval(value.audioTrackInterval);
					connectionsToDelete.push(connectionId);
				}
			}
		);

		connectionsToDelete.forEach((connectionId) => {
			this.openviduMap.delete(connectionId);
		});
	}

	clean() {
		this.deleteStreamManagerWithRole(OpenViduRole.PUBLISHER);
		this.deleteStreamManagerWithRole(OpenViduRole.SUBSCRIBER);
		if (this.nodeWebrtcService) {
			this.nodeWebrtcService.clean();
		}

		if (this.isUsingKms()) {
			KurentoWebRTC.clean();
		}
	}

	getStreamsCreated(): number {
		let result = 0;
		this.connections.forEach((value: { publishers: string[]; subscribers: string[] }, key: string) => {
			let streamsSent = value.publishers.length;
			let streamsReceived = 0;
			const publishersInWorker = value.publishers.length;
			let externalPublishers = this.totalPublishers - publishersInWorker;
			if (externalPublishers < 0) {
				externalPublishers = 0;
			}
			// Add all streams subscribed by publishers
			streamsReceived = publishersInWorker * externalPublishers + publishersInWorker * (publishersInWorker - 1);

			streamsReceived += value.subscribers.length * this.totalPublishers;
			result += streamsSent + streamsReceived;
		});

		return result;
	}

	getParticipantsCreated(): number {
		return this.openviduMap.size;
	}

	private async getToken(properties: TestProperties): Promise<string> {
		return this.httpClient.getToken(properties);
	}

	private storeInstances(openvidu: OpenVidu, session: Session, audioTrackInterval: NodeJS.Timer) {
		// Store the OV and Session objects into a map
		this.openviduMap.set(session.connection.connectionId, { openvidu, session, audioTrackInterval });
	}

	private storeConnection(connectionId: string, properties: TestProperties) {
		if (this.connections.has(properties.sessionName)) {
			if (properties.role === OpenViduRole.PUBLISHER) {
				this.connections.get(properties.sessionName).publishers.push(connectionId);
			} else {
				this.connections.get(properties.sessionName).subscribers.push(connectionId);
			}
		} else {
			const subscribers = [];
			const publishers = [];
			if (properties.role === OpenViduRole.PUBLISHER) {
				publishers.push(connectionId);
			} else {
				subscribers.push(connectionId);
			}
			this.connections.set(properties.sessionName, { publishers, subscribers });
		}
	}

	private deleteConnection(sessionName: string, connectionId: string, role: OpenViduRole) {
		const value = this.connections.get(sessionName);
		let index = -1;
		if (!!value) {
			if (role === OpenViduRole.PUBLISHER) {
				index = value.publishers.indexOf(connectionId, 0);
				if (index >= 0) {
					value.publishers.splice(index, 1);
				}
			} else {
				index = value.subscribers.indexOf(connectionId, 0);
				if (index >= 0) {
					value.subscribers.splice(index, 1);
				}
			}
		}
	}

	private async createMediaStreamTracks(properties: TestProperties): Promise<MediaStreamTracksResponse> {
		let videoTrack: MediaStreamTrack | boolean = properties.video;
		let audioTrack: MediaStreamTrack | boolean = properties.audio;

		if (this.isUsingKms()) {
			await KurentoWebRTC.setPlayerEndpointPath(`${this.KMS_MEDIAFILES_PATH}/video_${properties.resolution}.mkv`);
			KurentoWebRTC.setRecorderEndpointPrefix(
				`${this.KMS_RECORDINGS_PATH}/kms_${properties.recordingMetadata}_${properties.sessionName}_${new Date().getTime()}`
			);
			return { audioTrack, videoTrack };
		}

		// Using NODE_WEBRTC_CANVAS or NODE_WEBRTC_FFMPEG
		return await this.nodeWebrtcService.createMediaStreamTracks(properties.video, properties.audio);
	}

	private isUsingKms(): boolean {
		return EMULATED_USER_TYPE === EmulatedUserType.KMS;
	}

	private isUsingNodeWebrtcFfmpeg(): boolean {
		return EMULATED_USER_TYPE === EmulatedUserType.NODE_WEBRTC_FFMPEG;
	}

	private isUsingNodeWebrtcCanvas(): boolean {
		return EMULATED_USER_TYPE === EmulatedUserType.NODE_WEBRTC_CANVAS;
	}

	private subscriberToSessionsEvents(session: Session) {
		session.on('connectionCreated', (event: ConnectionEvent) => {
			var connectionType = 'remote';
			if (event.connection.connectionId === session.connection.connectionId) {
				connectionType = 'local';
			}
			const message: string = JSON.stringify({
				event: 'connectionCreated',
				connectionId: event.connection.connectionId,
				connection: connectionType,
			});
			this.wsService.send(message);
		});

		session.on('streamCreated', (event: StreamEvent) => {
			const message: string = JSON.stringify({ event: 'streamCreated', connectionId: event.stream.streamId, connection: 'remote' });
			this.wsService.send(message);
			const subscriber = session.subscribe(event.stream, null);

			subscriber.on('streamPlaying', (e: StreamEvent) => {
				const message: string = JSON.stringify({
					event: 'streamPlaying',
					connectionId: event.stream.streamId,
					connection: 'remote',
				});
				this.wsService.send(message);
			});
		});

		session.on('streamDestroyed', (event: StreamEvent) => {
			const message: string = JSON.stringify({ event: 'streamDestroyed', connectionId: event.stream.streamId, connection: 'remote' });
			this.wsService.send(message);
		});

		session.on('sessionDisconnected', (event: SessionDisconnectedEvent) => {
			const message: string = JSON.stringify({
				event: 'sessionDisconnected',
				connectionId: session.connection.connectionId,
				reason: event.reason,
				connection: 'local',
			});
			this.wsService.send(message);
			console.log(session.connection.role);
			this.deleteConnection(session.sessionId, session.connection.connectionId, <OpenViduRole>session.connection.role);
		});

		session.on('exception', (exception: ExceptionEvent) => {
			if (exception.name === 'ICE_CANDIDATE_ERROR') {
				// Error on sendIceCandidate
				console.error(exception);
				this.exceptionFound = true;
				this.exceptionMessage = 'Exception found in openvidu-browser';
				const connectionId = (<any>exception.origin).connection.connectionId;
				const message: string = JSON.stringify({ event: 'exception', connectionId, reason: exception.message });
				this.wsService.send(message);
			}
		});
	}

	private subscriberToPublisherEvents(publisher: Publisher) {
		publisher.once('accessAllowed', (e) => {
			const message: string = JSON.stringify({ event: 'accessAllowed', connectionId: '', connection: 'local' });
			this.wsService.send(message);
		});
		publisher.once('streamCreated', (e: StreamEvent) => {
			const message: string = JSON.stringify({ event: 'streamCreated', connectionId: e.stream.streamId, connection: 'local' });
			this.wsService.send(message);
		});
		publisher.once('streamPlaying', (e) => {
			const message: string = JSON.stringify({ event: 'streamPlaying', connectionId: '', connection: 'local' });
			this.wsService.send(message);
		});
		publisher.once('streamDestroyed', (e: StreamEvent) => {
			const message: string = JSON.stringify({ event: 'streamDestroyed', connectionId: e.stream.streamId, connection: 'local' });
			this.wsService.send(message);
		});
	}
}
