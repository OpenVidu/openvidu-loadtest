import { OpenVidu, Publisher, Session, StreamEvent } from "openvidu-browser";
import { HttpClient } from "../utils/http-client";
import { OpenViduRole } from './OpenVidu/OpenviduRole';
const { RTCVideoSource, rgbaToI420 } = require('wrtc').nonstandard;
const { createCanvas, loadImage } = require('canvas');

export class OpenViduBrowser {
	openviduMap: Map<string, OpenVidu> = new Map();
	sessionMap: Map<string, Session> = new Map();
	httpClient: HttpClient;

	private width = 640;
	private height = 480;
	private source;
	private track: MediaStreamTrack;
	private canvas;
	private context;
	private myimg;
	private MIN = 0;
	private canvasInterval: NodeJS.Timer;
	private canvasIntervalIterations: number = 0;
	private MAX_HEIGHT: number;
	private MAX_WIDTH: number;

	private SLOW_ITERATION_MS = 2000;
	private SLOW_ITERATIONS_NUMBER_LIMIT = 4;

	constructor() {
		this.httpClient = new HttpClient();
		this.initializeVideoCanvas();
	}

	async createStreamManager(userId: string, sessionName: string, role: OpenViduRole): Promise<string> {
		return new Promise(async (resolve, reject) => {

			const ov: OpenVidu = new OpenVidu();
			ov.enableProdMode();
			const session: Session = ov.initSession();

			session.on("streamCreated", (event: StreamEvent) => {
				session.subscribe(event.stream, null);
			});

			try {
				const token: string = await this.getToken(sessionName, role);
				await session.connect(token,  { clientData: userId });
				if(role === OpenViduRole.PUBLISHER){
					this.stopVideoCanvasInterval();
					const publisher: Publisher = ov.initPublisher(null);
					await session.publish(publisher);
					await publisher.replaceTrack(this.track);
					this.startVideoCanvasInterval();
				}

				this.storeInstances(ov, session);
				resolve(session.connection.connectionId);
			} catch (error) {
				console.log(
					"There was an error connecting to the session:",
					error.code,
					error.message
				);
				reject(error);
			}
		});
	}

	deleteStreamManagerWithConnectionId(connectionId: string) {
		const session = this.sessionMap.get(connectionId);
		session?.disconnect();
		this.deleteInstancesFromId(connectionId);
	}

	deleteStreamManagerWithRole(role: OpenViduRole) {
		const connectionsToDelete = [];
		this.sessionMap.forEach((session: Session, connectionId: string) => {
			if (session.connection.role === role) {
				session.disconnect();
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

	private storeInstances(ov: OpenVidu, session: Session) {
		// Store the OV and Session objects into a map
		this.openviduMap.set(session.connection.connectionId, ov);
		this.sessionMap.set(session.connection.connectionId, session);
	}

	private deleteInstancesFromId(connectionId: string) {
		this.sessionMap.delete(connectionId);
		this.openviduMap.delete(connectionId);
	}

	private async startVideoCanvasInterval(timeoutMs: number = 800){

		this.canvasInterval = setInterval(() => {
			const x = Math.floor(Math.random() * (this.MAX_WIDTH - this.MIN + 1) + this.MIN);
			const y = Math.floor(Math.random() * (this.MAX_HEIGHT - this.MIN + 1) + this.MIN);

			this.context.save();
			this.context.fillRect(0, 0, this.width, this.height);
			this.context.drawImage(this.myimg, x, y);
			this.context.restore();

			const rgbaFrame = this.context.getImageData(0, 0, this.width, this.height);
			const i420Frame = {
				width: this.width,
				height: this.height,
				data: new Uint8ClampedArray(1.5 * this.width * this.height)
			};
			rgbaToI420(rgbaFrame, i420Frame);
			this.source.onFrame(i420Frame);
			this.canvasIntervalIterations++;

			if(this.canvasIntervalIterations > this.SLOW_ITERATIONS_NUMBER_LIMIT && timeoutMs < this.SLOW_ITERATION_MS){
				// Slowing down canvas interval
				this.stopVideoCanvasInterval();
				this.startVideoCanvasInterval(this.SLOW_ITERATION_MS);
			}
		}, timeoutMs);
	}

	private stopVideoCanvasInterval() {
		this.canvasIntervalIterations = 0;
		clearInterval(this.canvasInterval);
	}

	private async initializeVideoCanvas(){
		this.source = new RTCVideoSource();
		this.track = this.source.createTrack();
		this.canvas = createCanvas(this.width, this.height);
		this.context = this.canvas.getContext('2d');
		this.myimg = await loadImage('src/assets/images/openvidu_logo.png');
		this.context.fillStyle = 'black';
		this.context.fillRect(0, 0, this.width, this.height);
		this.MAX_WIDTH = this.width - this.myimg.width;
		this.MAX_HEIGHT = this.height - this.myimg.height;
	}
}
