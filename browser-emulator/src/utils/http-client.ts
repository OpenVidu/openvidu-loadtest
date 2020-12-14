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
	mapSessions = {};
	// Collection to pair session names with tokens
	mapSessionNamesTokens = {};

	constructor() {
		this.OV = new OpenViduNodeClient(OPENVIDU_URL, OPENVIDU_SECRET);
	}
	async getToken(mySessionId: string, role: OpenViduRole): Promise<string> {
		const sessionId = await this.createSession(mySessionId);
		return this.createToken(sessionId, role);
	}

	private createSession(sessionId: string): Promise<string> {
		return new Promise(async (resolve, reject) => {
			if (this.mapSessions[sessionId]) {
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
					this.mapSessions[sessionId] = session;
					this.mapSessionNamesTokens[sessionId] = [];
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
			const mySession = this.mapSessions[sessionId];
			try {
				// Generate a new token asynchronously with the recently created connectionProperties
				const connection: Connection = await mySession.createConnection(
					connectionProperties
				);
				this.mapSessionNamesTokens[sessionId].push(connection.token);
				resolve(connection.token);
			} catch (error) {
				console.error(error);
				reject(error);
			}
		});
	}
}
