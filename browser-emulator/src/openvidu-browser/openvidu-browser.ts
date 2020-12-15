import { OpenVidu, Publisher, Session, StreamEvent } from "openvidu-browser";
import { OpenViduRole } from "openvidu-node-client";
import { HttpClient } from "../utils/http-client";

export class OpenViduBrowser {
	openviduMap: Map<string, OpenVidu> = new Map();
	sessionMap: Map<string, Session> = new Map();
	httpClient: HttpClient;

	constructor() {
		this.httpClient = new HttpClient();
	}

	async createPublisher(uid: string, sessionName: string): Promise<void> {
		return new Promise(async (resolve, reject) => {

			const ov = this.createAndStoreOVInstance(uid);
			const session = this.createAndStoreSessionInstance(uid, ov);

			session.on("streamCreated", (event: StreamEvent) => {
				session.subscribe(event.stream, null);
			});

			try {
				const token: string = await this.getToken(sessionName, OpenViduRole.PUBLISHER);
				await session.connect(token);
				const publisher: Publisher = ov.initPublisher(null);
				await session.publish(publisher);
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

	async createSubscriber(uid: string, sessionName: string): Promise<void> {
		return new Promise(async (resolve, reject) => {

			const ov = this.createAndStoreOVInstance(uid);
			const session = this.createAndStoreSessionInstance(uid, ov);

			session.on("streamCreated", (event: StreamEvent) => {
				session.subscribe(event.stream, null);
			});

			try {
				const token: string = await this.getToken(sessionName, OpenViduRole.SUBSCRIBER);
				await session.connect(token);
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

	deleteStreamManagerWithUid(uid: string) {
		const session = this.sessionMap.get(uid);
		session?.disconnect();
		this.deleteInstancesFromId(uid);
	}

	deleteStreamManagerWithRole(role: OpenViduRole) {
		this.sessionMap.forEach((session: Session, uid: string) => {
			if (session.connection.role === role) {
				session.disconnect();
				this.deleteInstancesFromId(uid);
			}
		});
	}

	private async getToken(sessionName: string, role: OpenViduRole): Promise<string> {
		return this.httpClient.getToken(sessionName, role);
	}

	private createAndStoreOVInstance(uid: string): OpenVidu {
		const ov: OpenVidu = new OpenVidu();
		ov.enableProdMode();
		// Store the OV object into a map
		this.openviduMap.set(uid, ov);
		return ov;
	}

	private createAndStoreSessionInstance(uid:string, ov: OpenVidu): Session {
		const session: Session = ov.initSession();
		// Store the session object into a map
		this.sessionMap.set(uid, session);
		return session;
	}

	private deleteInstancesFromId(uid: string) {
		this.sessionMap.delete(uid);
		this.openviduMap.delete(uid);
	}
}
