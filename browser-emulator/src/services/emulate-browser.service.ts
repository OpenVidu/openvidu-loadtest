import { ConnectionEvent, OpenVidu, Publisher, Session, SessionDisconnectedEvent, StreamEvent } from "openvidu-browser";
import { HttpClient } from "../utils/http-client";
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

export class EmulateBrowserService {
	private openviduMap: Map<string, {openvidu: OpenVidu, session: Session, audioTrackInterval: NodeJS.Timer}> = new Map();
	private readonly WIDTH = 640;
	private readonly HEIGHT = 480;
	private publishersCreated = 0;
	private subscribersCreated = 0;
	private exceptionFound: boolean = false;
	private exceptionMessage: string = '';
	constructor(
		private httpClient: HttpClient = new HttpClient(),
		private nodeWebrtcService: CanvasService | FfmpegService = null,
		private wsService: WsService = WsService.getInstance()
		) {
		if(this.isUsingNodeWebrtcCanvas()){
			this.nodeWebrtcService = new CanvasService(this.HEIGHT, this.WIDTH);
		} else if (this.isUsingNodeWebrtcFfmpeg()){
			this.nodeWebrtcService = new FfmpegService(this.HEIGHT, this.WIDTH);
		}
	}

	async createStreamManager(token: string, properties: TestProperties): Promise<string> {
		return new Promise(async (resolve, reject) => {
			try {
				if (this.exceptionFound) {
					throw {status: 500, message: this.exceptionMessage};
				}

				if (!token) {
					token = await this.getToken(properties);
				}

				let mediaStreamTracks: MediaStreamTracksResponse;
				const ov: OpenVidu = new OpenVidu();
				ov.enableProdMode();
				const session: Session = ov.initSession();
				this.subscriberToSessionsEvents(session);

				await session.connect(token,  properties.userId);
				if(properties.role === OpenViduRole.PUBLISHER){

					mediaStreamTracks = await this.createMediaStreamTracks(properties);

					const publisher: Publisher = ov.initPublisher(null, {
						audioSource: mediaStreamTracks.audioTrack,
						videoSource: mediaStreamTracks.videoTrack,
						publishAudio: properties.audio,
						publishVideo: properties.video,
						resolution: this.WIDTH + 'x' + this.HEIGHT,
						frameRate: properties.frameRate,
					});

					this.subscriberToPublisherEvents(publisher);
					await session.publish(publisher);

				}

				this.storeInstances(ov, session, mediaStreamTracks?.audioTrackInterval);
				this.storeParticipant(properties.role);
				resolve(session.connection.connectionId);
			} catch (error) {
				console.log(
					"There was an error connecting to the session:",
					error
				);
				reject({status:error.status, message: error.statusText || error.message || error});
			}
		});
	}

	deleteStreamManagerWithConnectionId(connectionId: string): void {
		const {session, audioTrackInterval} = this.openviduMap.get(connectionId);
		session?.disconnect();
		clearInterval(audioTrackInterval);
		this.openviduMap.delete(connectionId);
	}

	deleteStreamManagerWithRole(role: OpenViduRole) {
		const connectionsToDelete = [];
		this.openviduMap.forEach((value: {session: Session, openvidu: OpenVidu, audioTrackInterval: NodeJS.Timer}, connectionId: string) => {
			if (value.session.connection.role === role) {
				value.session.disconnect();
				clearInterval(value.audioTrackInterval);
				connectionsToDelete.push(connectionId);
			}
		});

		connectionsToDelete.forEach(connectionId => {
			this.openviduMap.delete(connectionId);
		});
	}

	getStreamsCreated(): number {

		let streamsSent = this.publishersCreated;
		let stremsReceived = 0;

		if(this.publishersCreated > 1) {
			// Add all streams subscribed by publishers
			stremsReceived = this.publishersCreated * (this.publishersCreated - 1);
		}

		stremsReceived += this.subscribersCreated * this.publishersCreated;

		return streamsSent + stremsReceived;
	}

	private async getToken(properties: TestProperties): Promise<string> {
		return this.httpClient.getToken(properties);
	}

	private storeInstances(openvidu: OpenVidu, session: Session, audioTrackInterval: NodeJS.Timer) {
		// Store the OV and Session objects into a map
		this.openviduMap.set(session.connection.connectionId, {openvidu, session, audioTrackInterval});
	}

	private storeParticipant(role: OpenViduRole) {
		if(role === OpenViduRole.PUBLISHER) {
			this.publishersCreated += 1;
		} else {
			this.subscribersCreated +=1;
		}
	}

	private async createMediaStreamTracks(properties: TestProperties): Promise<MediaStreamTracksResponse> {
		let videoTrack: MediaStreamTrack | boolean = properties.video;
		let audioTrack: MediaStreamTrack | boolean = properties.audio;

		if(this.isUsingKms()) {
			return {audioTrack, videoTrack};
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
		session.on("connectionCreated", (event: ConnectionEvent) => {
			var connectionType = 'remote';
			if (event.connection.connectionId === session.connection.connectionId) {
				connectionType = 'local';
			}
			const message: string = JSON.stringify({ event: "connectionCreated", connectionId: event.connection.connectionId, connection: connectionType});
			this.wsService.send(message);
		});

		session.on("streamCreated", (event: StreamEvent) => {
			const message: string = JSON.stringify({event: "streamCreated", connectionId: event.stream.streamId,  connection: 'remote'});
			this.wsService.send(message);
			const subscriber = session.subscribe(event.stream, null);

			subscriber.on("streamPlaying", (e: StreamEvent) => {
				const message: string = JSON.stringify({ event: "streamPlaying", connectionId: event.stream.streamId,  connection: 'remote'});
				this.wsService.send(message);
			});
		});

		session.on("streamDestroyed", (event: StreamEvent) => {
			const message: string = JSON.stringify({event: "streamDestroyed", connectionId: event.stream.streamId,  connection: 'remote'});
			this.wsService.send(message);

		});

		session.on('sessionDisconnected', (event: SessionDisconnectedEvent) => {
			const message: string = JSON.stringify({event: "sessionDisconnected", connectionId: session.connection.connectionId, reason: event.reason, connection: 'local'});
			this.wsService.send(message);
		});

		session.on('exception', (exception: ExceptionEvent) => {
			if (exception.name === 'ICE_CANDIDATE_ERROR') {
				// Error on sendIceCandidate
				console.error(exception);
				this.exceptionFound = true;
				this.exceptionMessage = 'Exception found in openvidu-browser';
				const message: string = JSON.stringify({ event: "exception", connectionId: exception.origin.connection.connectionId, reason: exception.message });
				this.wsService.send(message);
			}
		});
	}

	private subscriberToPublisherEvents(publisher: Publisher) {
		publisher.once("accessAllowed", e => {
			const message: string = JSON.stringify({ event: "accessAllowed", connectionId: '', connection: 'local' });
			this.wsService.send(message);
		});
		publisher.once("streamCreated", (e: StreamEvent) => {
			const message: string = JSON.stringify({ event: "streamCreated", connectionId: e.stream.streamId, connection: 'local' });
			this.wsService.send(message);
		});
		publisher.once("streamPlaying", e => {
			const message: string = JSON.stringify({ event: "streamPlaying", connectionId: '', connection: 'local' });
			this.wsService.send(message);
		});
		publisher.once("streamDestroyed", (e: StreamEvent) => {
			const message: string = JSON.stringify({ event: "streamDestroyed", connectionId: e.stream.streamId, connection: 'local' });
			this.wsService.send(message);
		});
	}

}
