import {
	Connection,
	ConnectionProperties,
	OpenVidu as OpenViduNodeClient,
	OpenViduRole,
	Session,
	SessionProperties,
} from "openvidu-node-client";
import { OPENVIDU_URL, OPENVIDU_SECRET } from "../config";

export class HttpClient {
	OV: OpenViduNodeClient;
	// Collection to pair session names with OpenVidu Session objects
	sessionMap: Map<string, Session> = new Map();
	// Collection to pair session names with tokens
	sessionNamesTokensMap: Map<string, string[]> = new Map();

	constructor() {
		this.OV = new OpenViduNodeClient(OPENVIDU_URL, OPENVIDU_SECRET);
	}
	async getToken(mySessionId: string, role: OpenViduRole): Promise<string> {
		const sessionId = await this.createSession(mySessionId);
		return this.createToken(sessionId, role);
	}

	private createSession(sessionId: string): Promise<string> {
		return new Promise(async (resolve, reject) => {
			if (this.sessionMap.get(sessionId)) {
				console.log("Session " + sessionId + " already exists");
				resolve(sessionId);
			} else {
				console.log("New session " + sessionId);
				const sessionProperties: SessionProperties = {
					customSessionId: sessionId,
				};

				try {
					// Create a new OpenVidu Session asynchronously
					const session: Session = await this.OV.createSession(
						sessionProperties
					);
					this.sessionMap.set(sessionId, session);
					this.sessionNamesTokensMap.set(sessionId, []);
					resolve(sessionId);
				} catch (error) {
					console.error(error);
					reject(error);
				}
			}
		});
	}

	private createToken(sessionId: string, role: OpenViduRole): Promise<string> {
		const connectionProperties: ConnectionProperties = {
			role: role,
		};

		return new Promise(async (resolve, reject) => {
			const mySession = this.sessionMap.get(sessionId);
			try {
				// Generate a new token asynchronously with the recently created connectionProperties
				const connection: Connection = await mySession.createConnection(
					connectionProperties
				);
				const tokens = this.sessionNamesTokensMap.get(sessionId);
				tokens.push(connection.token);
				this.sessionNamesTokensMap.set(sessionId, tokens);
				resolve(connection.token);
			} catch (error) {
				console.error(error);
				reject(error);
			}
		});
	}
}
