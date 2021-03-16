import { OpenVidu, Publisher, Session, StreamEvent } from "openvidu-browser";
import { HttpClient } from "../utils/http-client";
import { OpenViduRole } from '../types/openvidu.type';
import { TestProperties } from '../types/api-rest.type';
const { RTCVideoSource, rgbaToI420 } = require('wrtc').nonstandard;
import { Canvas, createCanvas, Image, loadImage } from 'canvas';
import { EMULATED_USER_TYPE } from '../config';
import { EmulatedUserType } from '../types/config.type';

export class EmulateBrowserService {
	private openviduMap: Map<string, {openvidu: OpenVidu, session: Session}> = new Map();
	private readonly WIDTH = 640;
	private readonly HEIGHT = 480;
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
					if(this.isUsingNodeWebrtc()) {
						this.stopVideoCanvasInterval();
					}
					const publisher: Publisher = ov.initPublisher(null, {
						audioSource: properties.audio,
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

				this.storeInstances(ov, session);
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
		const {session} = this.openviduMap.get(connectionId);
		session?.disconnect();
		this.openviduMap.delete(connectionId);
	}

	deleteStreamManagerWithRole(role: OpenViduRole) {
		const connectionsToDelete = [];
		this.openviduMap.forEach((value: {session: Session, openvidu: OpenVidu}, connectionId: string) => {
			if (value.session.connection.role === role) {
				value.session.disconnect();
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

	private storeInstances(openvidu: OpenVidu, session: Session) {
		// Store the OV and Session objects into a map
		this.openviduMap.set(session.connection.connectionId, {openvidu, session});
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
	}

	private isUsingNodeWebrtc(): boolean {
		return EMULATED_USER_TYPE === EmulatedUserType.NODE_WEBRTC;
	}
}
