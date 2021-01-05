import { OpenVidu, Publisher, Session, StreamEvent } from "openvidu-browser";
import { OpenViduRole } from "openvidu-node-client";
import { HttpClient } from "../utils/http-client";
const { RTCVideoSource, rgbaToI420 } = require('wrtc').nonstandard;
const { createCanvas, loadImage } = require('canvas');
const { performance } = require('perf_hooks');

export class OpenViduBrowser {
	openviduMap: Map<string, OpenVidu> = new Map();
	sessionMap: Map<string, Session> = new Map();
	httpClient: HttpClient;

	constructor() {
		this.httpClient = new HttpClient();
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
					const publisher: Publisher = ov.initPublisher(null);
					await session.publish(publisher);
					await this.createVideoCanvas(publisher);
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

	private async createVideoCanvas(publisher: Publisher){
		const width = publisher.stream.videoDimensions.width;
		const height = publisher.stream.videoDimensions.height;
		const source = new RTCVideoSource();
		const track = source.createTrack();
		const canvas = createCanvas(width, height);
		const context = canvas.getContext('2d');
		const myimg = await loadImage('src/assets/images/openvidu_logo.png');
		context.fillStyle = 'black';
		context.fillRect(0, 0, width, height);

		await publisher.replaceTrack(track);
		const interval = setInterval(() => {

			const thisTime = performance.now();

			context.save();
			context.translate(width * 0.5, height * 0.5);
			context.rotate(thisTime / 1000);
			context.translate(-myimg.width * 0.5, -myimg.height * 0.5);
			context.fillStyle = 'black';
			context.fillRect(0, 0, width, height);
			context.drawImage(myimg,0,0);
			context.restore();

			const rgbaFrame = context.getImageData(0, 0, width, height);
			const i420Frame = {
				width,
				height,
				data: new Uint8ClampedArray(1.5 * width * height)
			};
			rgbaToI420(rgbaFrame, i420Frame);
			source.onFrame(i420Frame);
		});

	}
}
