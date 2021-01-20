var btoa = require("btoa");
import axios, { AxiosRequestConfig } from "axios";
import * as https from "https";
// import { OPENVIDU_URL, OPENVIDU_SECRET } from "../config";
import { OpenViduRole } from '../openvidu-browser/OpenVidu/OpenviduTypes';

export class HttpClient {
	private OPENVIDU_URL: string;
	private OPENVIDU_SECRET: string;
	constructor() {}
	async getToken(mySessionId: string, role: OpenViduRole): Promise<string> {
		this.OPENVIDU_SECRET = process.env.OPENVIDU_SECRET;
		this.OPENVIDU_URL = process.env.OPENVIDU_URL;

		const sessionId = await this.createSession(mySessionId);
		return this.createToken(sessionId, role);
	}

	private createSession(sessionId): Promise<string> {
		return new Promise((resolve, reject) => {
			const data = JSON.stringify({ customSessionId: sessionId });
			axios
				.post(this.OPENVIDU_URL + "/openvidu/api/sessions", data, {
					headers: {
						Authorization: "Basic " + btoa("OPENVIDUAPP:" + this.OPENVIDU_SECRET),
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
								this.OPENVIDU_URL
						);
					}
				});
		});
	}

	private createToken(sessionId: string, role: OpenViduRole): Promise<string> {
		return new Promise((resolve, reject) => {
			const data = JSON.stringify({
				type: "WEBRTC",
				record: false,
				role: role
			});
			axios
				.post(
					this.OPENVIDU_URL + "/openvidu/api/sessions/" + sessionId + "/connection",
					data,
					{
						headers: {
							Authorization: "Basic " + btoa("OPENVIDUAPP:" + this.OPENVIDU_SECRET),
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