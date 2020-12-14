import { OpenVidu, Session, StreamEvent } from "openvidu-browser";
import { OpenViduRole } from 'openvidu-node-client';
import { HttpClient } from "../utils/http-client";

export class OpenViduBrowser {
	ov: OpenVidu;
	session: Session;
	sessionId: string;
	httpClient: HttpClient;

	constructor() {
		this.httpClient = new HttpClient();
		this.ov = new OpenVidu();
		this.ov.enableProdMode();
		this.session = this.ov.initSession();
		this.sessionId = "FAKEwebrtc";
		this.session.on("streamCreated", (event: StreamEvent) => {
			this.session.subscribe(event.stream, "subscriber");
		});
	}

	async createPublisher(): Promise<void> {

		return new Promise(async (resolve, reject) => {
			try {
				const token: string = await this.getPublisherToken();
				await this.session.connect(token);
				var publisher = this.ov.initPublisher(null);
				await this.session.publish(publisher);
				resolve();

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

	private async getPublisherToken(): Promise<string> {
		return this.httpClient.getToken(this.sessionId, OpenViduRole.PUBLISHER);
	}
}
