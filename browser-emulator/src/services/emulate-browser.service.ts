import { OpenVidu, Publisher, Session, StreamEvent } from "openvidu-browser";
import { HttpClient } from "../utils/http-client";
import { OpenViduRole } from '../types/openvidu.type';
import { TestProperties } from '../types/api-rest.type';
const { RTCVideoSource, RTCAudioSource, rgbaToI420 } = require('wrtc').nonstandard;
import { Canvas, createCanvas, Image, loadImage } from 'canvas';
import { EMULATED_USER_TYPE } from '../config';
import { EmulatedUserType } from '../types/config.type';

export class EmulateBrowserService {
	private openviduMap: Map<string, {openvidu: OpenVidu, session: Session, audioTrackInterval: NodeJS.Timer}> = new Map();
	private readonly WIDTH = 640;
	private readonly HEIGHT = 480;
	private readonly MIN_FREQUENCY = 500;
	private readonly MAX_FREQUENCY = 1000;
	private videoSource;
	private videoTrack: MediaStreamTrack | boolean = true;
	private canvas: Canvas;
	private context;
	private myimg: Image;
	private MIN = 0;
	private canvasInterval: NodeJS.Timer;
	private CANVAS_MAX_HEIGHT: number;
	private CANVAS_MAX_WIDTH: number;

	constructor(private httpClient: HttpClient = new HttpClient()) {
		if(this.isUsingNodeWebrtc()) {
			this.initializeVideoCanvas();
		}
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
					let audioSource: MediaStreamTrack | boolean = properties.audio;
					if(this.isUsingNodeWebrtc()) {
						this.stopVideoCanvasInterval();
					}

					// TODO: Debugear openvidu para ver que pasa con el audio track

					if(audioSource) {
						//Create an emulated audio stream track
						const audioObject = this.initializeAudio();
						audioSource = audioObject.audioSource;
						// audioTrackInterval = audioObject.audioTrackInterval;
					}

					const publisher: Publisher = ov.initPublisher(null, {
						audioSource: audioSource,
						videoSource: properties.video ? this.videoTrack : null,
						publishAudio: properties.audio,
						publishVideo: properties.video,
						resolution: this.WIDTH + 'x' + this.HEIGHT,
						frameRate: properties.frameRate,
					});
					await session.publish(publisher);
					if(this.isUsingNodeWebrtc()) {
						const frameRateEstimation = 1000 / properties.frameRate;
						this.startVideoCanvasInterval(frameRateEstimation);
					}
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

	private async startVideoCanvasInterval(timeoutMs: number = 30) {
		// Max 30 fps
		timeoutMs =  timeoutMs < 30 ? 30 : timeoutMs;
		this.context.fillStyle = '#' + Math.floor(Math.random()*16777215).toString(16);

		this.canvasInterval = setInterval(() => {
			const x = Math.floor(Math.random() * (this.CANVAS_MAX_WIDTH - this.MIN + 1) + this.MIN);
			const y = Math.floor(Math.random() * (this.CANVAS_MAX_HEIGHT - this.MIN + 1) + this.MIN);

			this.context.save();
			this.context.fillRect(0, 0, this.WIDTH, this.HEIGHT);
			this.context.drawImage(this.myimg, x, y);
			// this.context.font = "50px Verdana";
			// this.context.strokeText("Hello World!", 100, 100);

			this.context.restore();

			const rgbaFrame = this.context.getImageData(0, 0, this.WIDTH, this.HEIGHT);
			const i420Frame = {
				width: this.WIDTH,
				height: this.HEIGHT,
				data: new Uint8ClampedArray(1.5 * this.WIDTH * this.HEIGHT)
			};
			rgbaToI420(rgbaFrame, i420Frame);
			this.videoSource.onFrame(i420Frame);
		}, timeoutMs);
	}

	private stopVideoCanvasInterval() {
		clearInterval(this.canvasInterval);
	}

	private async initializeVideoCanvas(){
		this.videoSource = new RTCVideoSource();
		this.videoTrack = this.videoSource.createTrack();
		this.canvas = createCanvas(this.WIDTH, this.HEIGHT);
		this.context = this.canvas.getContext('2d');
		this.myimg = await loadImage('src/assets/images/openvidu_logo.png');
		this.context.fillStyle = 'black';
		this.context.fillRect(0, 0, this.WIDTH, this.HEIGHT);
		this.CANVAS_MAX_WIDTH = this.WIDTH - this.myimg.width;
		this.CANVAS_MAX_HEIGHT = this.HEIGHT - this.myimg.height;
		// Try with a video file https://dev.to/benjaminadk/encode-gifs-with-node-4c75
	}

	private initializeAudio(): {audioSource:MediaStreamTrack, audioTrackInterval: NodeJS.Timer} {

		const options = {
			channelCount: 1,
			sampleRate: 30000,
			frequency: Math.floor(Math.random() * (this.MAX_FREQUENCY - this.MIN_FREQUENCY) + this.MIN_FREQUENCY),
			time: 0,
		};
		const bitsPerSample = 16;
		const maxValue = Math.pow(2, bitsPerSample) / 2 - 1;
		const numberOfFrames = options.sampleRate / 100;
		const secondsPerSample = 1 / options.sampleRate;
		const audioSource = new RTCAudioSource();
		const samples = new Int16Array(options.channelCount * numberOfFrames);

		const data = {
			samples,
			sampleRate: options.sampleRate,
			bitsPerSample,
			channelCount: options.channelCount,
			numberOfFrames
		};

		const audioInterval = setInterval(() => {
			for (let i = 0; i < numberOfFrames; i++) {
				options.time += secondsPerSample;
				for (let j = 0; j < options.channelCount; j++) {
				  samples[i * options.channelCount + j] = Math.sin(2 * Math.PI * options.frequency * options.time) * maxValue;
				}
			  }
			  audioSource.onData(data);
		}, 50)

		return {audioSource: audioSource.createTrack(), audioTrackInterval: audioInterval};
	}

	private isUsingNodeWebrtc(): boolean {
		return EMULATED_USER_TYPE === EmulatedUserType.NODE_WEBRTC;
	}
}
