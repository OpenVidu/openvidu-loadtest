import { OpenVidu, Publisher, Session, StreamEvent } from "openvidu-browser";
import { HttpClient } from "../utils/http-client";
import { OpenViduRole } from '../types/openvidu.type';
import { TestProperties } from '../types/api-rest.type';

import { MediaStreamTrack } from 'wrtc';

import { EMULATED_USER_TYPE } from '../config';
import { EmulatedUserType } from '../types/config.type';
import { CanvasService } from './emulated/canvas.service';
import { FfmpegService } from './emulated/ffmpeg.service';
import { MediaStreamTracksResponse } from '../types/emulate-webrtc.type';

export class EmulateBrowserService {
	private openviduMap: Map<string, {openvidu: OpenVidu, session: Session, audioTrackInterval: NodeJS.Timer}> = new Map();
	private readonly WIDTH = 640;
	private readonly HEIGHT = 480;
	private exceptionFound: boolean = false;
	private exceptionMessage: string = '';
	constructor(private httpClient: HttpClient = new HttpClient(), private nodeWebrtcService: CanvasService | FfmpegService = null) {
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

				session.on("streamCreated", (event: StreamEvent) => {
					session.subscribe(event.stream, null);
				});

				session.on('exception', (exception: any) => {
					if (exception.name === 'ICE_CANDIDATE_ERROR') {
						// Error on sendIceCandidate
						console.error(exception);
						this.exceptionFound = true;
						this.exceptionMessage = 'Exception found in openvidu-browser';
					}
				});

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
					await session.publish(publisher);

				}

				this.storeInstances(ov, session, mediaStreamTracks.audioTrackInterval);
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

	private async getToken(properties: TestProperties): Promise<string> {
		return this.httpClient.getToken(properties);
	}

	private storeInstances(openvidu: OpenVidu, session: Session, audioTrackInterval: NodeJS.Timer) {
		// Store the OV and Session objects into a map
		this.openviduMap.set(session.connection.connectionId, {openvidu, session, audioTrackInterval});
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

}
