var btoa = require("btoa");
import axios, { AxiosRequestConfig } from "axios";
import * as https from "https";
import { OPENVIDU_URL, OPENVIDU_SECRET } from "../config";
import { OpenViduRole } from '../openvidu-browser/OpenVidu/OpenviduTypes';

export class HttpClient {
	constructor() {}
	async getToken(mySessionId: string, role: OpenViduRole): Promise<string> {
		const sessionId = await this.createSession(mySessionId);
		return this.createToken(sessionId, role);
	}

	private createSession(sessionId): Promise<string> {
		return new Promise((resolve, reject) => {
			var data = JSON.stringify({ customSessionId: sessionId });
			axios
				.post(OPENVIDU_URL + "/openvidu/api/sessions", data, {
					headers: {
						Authorization: "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SECRET),
						"Content-Type": "application/json",
					},
					httpsAgent: new https.Agent({
						rejectUnauthorized: false,
					}),
				})
				.then((response) => {
					resolve(response.data.id);
				})
				.catch((response) => {
					var error = Object.assign({}, response);
					if (error.response && error.response.status === 409) {
						resolve(sessionId);
					} else {
						console.warn(
							"No connection to OpenVidu Server. This may be a certificate error at " +
								OPENVIDU_URL
						);
					}
				});
		});
	}

	private createToken(sessionId: string, role: OpenViduRole): Promise<string> {
		return new Promise((resolve, reject) => {
			var data = {
				type: "WEBRTC",
				record: false,
				role: role
			};
			axios
				.post(
					OPENVIDU_URL + "/openvidu/api/sessions/" + sessionId + "/connection",
					data,
					{
						headers: {
							Authorization: "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SECRET),
							"Content-Type": "application/json",
						},
						httpsAgent: new https.Agent({
							rejectUnauthorized: false,
						}),
					}
				)
				.then((response) => {
					resolve(response.data.token);
				})
				.catch((error) => reject(error));
		});
	}
}