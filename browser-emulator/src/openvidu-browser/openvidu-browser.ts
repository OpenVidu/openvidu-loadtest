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
}
