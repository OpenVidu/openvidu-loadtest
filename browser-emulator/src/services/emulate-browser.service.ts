import { OpenVidu, Publisher, Session, StreamEvent } from "openvidu-browser";
import { HttpClient } from "../utils/http-client";
import { OpenViduRole } from '../types/openvidu.type';
import { TestProperties } from '../types/api-rest.type';
const { RTCVideoSource, rgbaToI420 } = require('wrtc').nonstandard;
import { Canvas, createCanvas, Image, loadImage } from 'canvas';
import { WebrtcStatsStorage } from '../extra/wertc-stats-storage';

export class EmulateBrowserService {
	private openviduMap: Map<string, {openvidu: OpenVidu, session: Session}> = new Map();
	private readonly WIDTH = 640;
	private readonly HEIGHT = 480;
	private videoSource;
	private videoTrack: MediaStreamTrack;
	private canvas: Canvas;
	private context;
	private myimg: Image;
	private MIN = 0;
	private canvasInterval: NodeJS.Timer;
	private canvasIntervalIterations: number = 0;
	private CANVAS_MAX_HEIGHT: number;
	private CANVAS_MAX_WIDTH: number;
	private readonly CANVAS_SLOW_ITERATION_MS = 2000;
	private readonly CANVAS_SLOW_ITERATIONS_NUMBER_LIMIT = 4;

	constructor(private httpClient: HttpClient = new HttpClient()) {
		this.initializeVideoCanvas();
	}

	async createStreamManager(token: string, properties: TestProperties): Promise<string> {
		return new Promise(async (resolve, reject) => {
			try {
				// Create webrtc stats item in localStorage
				const webrtcStatsStorage = new WebrtcStatsStorage();
				globalThis.localStorage.setItem(webrtcStatsStorage.getItemName(), webrtcStatsStorage.getConfig());

				if(!token) {
					token = await this.getToken(properties.sessionName, properties.role);
				}

				const ov: OpenVidu = new OpenVidu();
				ov.enableProdMode();
				const session: Session = ov.initSession();

				session.on("streamCreated", (event: StreamEvent) => {
					session.subscribe(event.stream, null);
				});

				await session.connect(token,  properties.userId);
				if(properties.role === OpenViduRole.PUBLISHER){
					this.stopVideoCanvasInterval();
					const publisher: Publisher = ov.initPublisher(null, {
						audioSource: properties.audio,
						videoSource: properties.video,
						publishAudio: properties.audio,
						publishVideo: properties.video,
						resolution: this.WIDTH + 'x' + this.HEIGHT,
						frameRate: 30,
					});
					await session.publish(publisher);
					if(properties.video){
						await publisher.replaceTrack(this.videoTrack);
					}
					this.startVideoCanvasInterval();
				}

				this.storeInstances(ov, session);
				resolve(session.connection.connectionId);
			} catch (error) {
				console.log(
					"There was an error connecting to the session:",
					error
				);
				reject(error);
			}
		});
	}

	deleteStreamManagerWithConnectionId(connectionId: string) {
		const {session} = this.openviduMap.get(connectionId);
		session?.disconnect();
		this.deleteInstancesFromId(connectionId);
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
			this.deleteInstancesFromId(connectionId);
		});
	}

	private async getToken(sessionName: string, role: OpenViduRole): Promise<string> {
		return this.httpClient.getToken(sessionName, role);
	}

	private storeInstances(openvidu: OpenVidu, session: Session) {
		// Store the OV and Session objects into a map
		this.openviduMap.set(session.connection.connectionId, {openvidu, session});
	}

	private deleteInstancesFromId(connectionId: string) {
		this.openviduMap.delete(connectionId);

	}

	private async startVideoCanvasInterval(timeoutMs: number = 35){

		this.canvasInterval = setInterval(() => {
			const x = Math.floor(Math.random() * (this.CANVAS_MAX_WIDTH - this.MIN + 1) + this.MIN);
			const y = Math.floor(Math.random() * (this.CANVAS_MAX_HEIGHT - this.MIN + 1) + this.MIN);

			this.context.save();
			this.context.fillRect(0, 0, this.WIDTH, this.HEIGHT);
			this.context.drawImage(this.myimg, x, y);
			this.context.restore();

			const rgbaFrame = this.context.getImageData(0, 0, this.WIDTH, this.HEIGHT);
			const i420Frame = {
				width: this.WIDTH,
				height: this.HEIGHT,
				data: new Uint8ClampedArray(1.5 * this.WIDTH * this.HEIGHT)
			};
			rgbaToI420(rgbaFrame, i420Frame);
			this.videoSource.onFrame(i420Frame);
			this.canvasIntervalIterations++;

			// if(this.canvasIntervalIterations > this.CANVAS_SLOW_ITERATIONS_NUMBER_LIMIT && timeoutMs < this.CANVAS_SLOW_ITERATION_MS){
			// 	// Slowing down canvas interval
			// 	this.stopVideoCanvasInterval();
			// 	this.startVideoCanvasInterval(this.CANVAS_SLOW_ITERATION_MS);
			// }
		}, timeoutMs);
	}

	private stopVideoCanvasInterval() {
		this.canvasIntervalIterations = 0;
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
}
