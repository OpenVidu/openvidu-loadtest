import { OpenVidu, Publisher, Session, StreamEvent } from "openvidu-browser";
import { HttpClient } from "../utils/http-client";
import { OpenViduRole } from '../types/openvidu.type';
import { TestProperties } from '../types/api-rest.type';

// const { RTCVideoSource, RTCAudioSource } = require('wrtc').nonstandard;
import wrtc = require('wrtc');

import { EMULATED_USER_TYPE } from '../config';
import { EmulatedUserType } from '../types/config.type';

const ffmpeg = require('fluent-ffmpeg');
const chunker = require('stream-chunker');
import { StreamOutput } from 'fluent-ffmpeg-multistream';


interface CustomMediaStream {
	url: string,
	track: wrtc.MediaStreamTrack,
	options: string[],
	kind: string,
	width?: number,
	height?:number
};

export class EmulateBrowserService {
	private openviduMap: Map<string, {openvidu: OpenVidu, session: Session, audioTrackInterval: NodeJS.Timer}> = new Map();
	private readonly WIDTH = 640;
	private readonly HEIGHT = 480;
	private videoTrack: wrtc.MediaStreamTrack | boolean;
	private audioTrack: wrtc.MediaStreamTrack | boolean;
	private mediaStramTracksCreated: boolean = false;
	constructor(private httpClient: HttpClient = new HttpClient()) {
	}

	async createStreamManager(token: string, properties: TestProperties): Promise<string> {
		return new Promise(async (resolve, reject) => {
			try {
				let audioTrackInterval: NodeJS.Timer;
				if(!token) {
					token = await this.getToken(properties);
				}

				const ov: OpenVidu = new OpenVidu();
				ov.enableProdMode();
				const session: Session = ov.initSession();

				session.on("streamCreated", (event: StreamEvent) => {
					session.subscribe(event.stream, null);
				});

				await session.connect(token,  properties.userId);
				if(properties.role === OpenViduRole.PUBLISHER){

					await this.createMediaStreamTracks(properties);

					const publisher: Publisher = ov.initPublisher(null, {
						audioSource: this.audioTrack,
						videoSource: this.videoTrack,
						publishAudio: properties.audio,
						publishVideo: properties.video,
						resolution: this.WIDTH + 'x' + this.HEIGHT,
						frameRate: properties.frameRate,
					});
					await session.publish(publisher);

				}

				this.storeInstances(ov, session, audioTrackInterval);
				resolve(session.connection.connectionId);
			} catch (error) {
				console.log(
					"There was an error connecting to the session:",
					error
				);
				reject({status:error.status, message: error.statusText || error.message});
			}
		});
	}

	deleteStreamManagerWithConnectionId(connectionId: string) {
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

	private async createMediaStreamTracks(properties: TestProperties): Promise<void> {

		if(!this.mediaStramTracksCreated) {

			this.videoTrack = properties.video;
			this.audioTrack = properties.audio;

			if(this.isUsingNodeWebrtc()) {
				if(properties.audio || properties.video) {
					await this.createMediaStreamTracksFromVideoFile(properties.video, properties.audio);
				}
			}
		}

	}

	private async createMediaStreamTracksFromVideoFile(video: boolean, audio: boolean) {

		let videoOutput = null;
		let audioOutput = null;

		const command = ffmpeg()
							.input(`${process.env.PWD}/src/assets/mediafiles/video.mp4`)
							.inputOptions(['-stream_loop -1', '-r 1'])

		if(video) {
			videoOutput = this.createVideoOutput();
			command
				.output(videoOutput.url)
				.outputOptions(videoOutput.options)
		}

		if(audio) {
			audioOutput = this.createAudioOutput();
			command
				.output(audioOutput.url)
				.outputOptions(audioOutput.options)
		}

		command.run();

		this.videoTrack = videoOutput.track;
		this.audioTrack = audioOutput.track;
		this.mediaStramTracksCreated = true;
	}

	private createVideoOutput(): CustomMediaStream {

		const ws = chunker(this.WIDTH * this.HEIGHT * 1.5);
		const source = new wrtc.nonstandard.RTCVideoSource();
		const ffmpegOptions = [
			'-f rawvideo',
			// '-c:v rawvideo',
			`-s ${this.WIDTH}x${this.HEIGHT}`,
			'-pix_fmt yuv420p',
			'-r 24'
		];

		ws.on('data', (chunk) => {
			const data = {
				width: this.WIDTH,
				height: this.HEIGHT,
				data: new Uint8ClampedArray(chunk)
			};
			source.onFrame(data);
		});

		const output = StreamOutput(ws);
		output.track = source.createTrack();
		output.options = ffmpegOptions;
		output.kind = 'video';
		output.width = this.WIDTH;
		output.height = this.HEIGHT;

		return output;
	}
	private createAudioOutput(): CustomMediaStream {
		const sampleRate = 48000;
		const ws = chunker(2 * sampleRate / 100)
		const source = new wrtc.nonstandard.RTCAudioSource();
		const ffmpegOptions = [
			'-f s16le',
			'-ar 48k',
			'-ac 1'
		];
		ws.on('data', (chunk) => {
			const data = {
				samples: new Int16Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.length)),
				sampleRate
			};

			source.onData(data);
		});

		const output = StreamOutput(ws)
		output.track = source.createTrack()
		output.options = ffmpegOptions;
		output.kind = 'audio';

		return output;
	}

	private isUsingNodeWebrtc(): boolean {
		return EMULATED_USER_TYPE === EmulatedUserType.NODE_WEBRTC;
	}
}
