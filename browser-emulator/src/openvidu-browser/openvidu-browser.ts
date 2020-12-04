import { OpenVidu, Session, StreamEvent } from "openvidu-browser";
import { HttpClient } from "../utils/http-client";

export class OpenViduBrowser {
	ov: OpenVidu;
	session: Session;
	sessionId: string;
	httpClient: HttpClient;

	constructor() {
		this.httpClient = new HttpClient();
		this.ov = new OpenVidu();
		this.session = this.ov.initSession();
		this.sessionId = "FAKEwebrtc";
	}

	async createPublisher() {
		this.session.on("streamCreated", (event: StreamEvent) => {
			this.session.subscribe(event.stream, "subscriber");
		});

		try {
			const token: string = await this.getPublisherToken();
			await this.session.connect(token);
			var publisher = this.ov.initPublisher(null);
			this.session.publish(publisher);
		} catch (error) {
			console.log(
				"There was an error connecting to the session:",
				error.code,
				error.message
			);
			console.log(error);
		}
	}

	private async getPublisherToken(): Promise<string> {
		const role: string = "PUBLISHER";
		return this.httpClient.getToken(this.sessionId, role);
	}
}
