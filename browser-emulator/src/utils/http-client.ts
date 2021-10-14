var btoa = require('btoa');
import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';
import { RecordingLayoutMode, RecordingMode, RecordingOutputMode, TestProperties } from '../types/api-rest.type';
import { OpenViduRole } from '../types/openvidu.type';

export class HttpClient {
	private OPENVIDU_URL: string;
	private OPENVIDU_SECRET: string;
	constructor() {}
	async getToken(properties: TestProperties): Promise<string> {
		this.OPENVIDU_SECRET = process.env.OPENVIDU_SECRET;
		this.OPENVIDU_URL = process.env.OPENVIDU_URL;

		const sessionId = await this.createSession(properties.sessionName, properties.recordingOutputMode);
		return this.createToken(sessionId, properties.role);
	}

	private createSession(sessionId: string, recordingMode: RecordingOutputMode): Promise<string> {
		return new Promise((resolve, reject) => {
			let properties: any = { customSessionId: sessionId };
			const recording = recordingMode === RecordingOutputMode.COMPOSED || recordingMode === RecordingOutputMode.INDIVIDUAL;
			if (recording) {
				properties.defaultOutputMode = recordingMode;
				properties.defaultRecordingLayout = RecordingLayoutMode.BEST_FIT;
				properties.recordingMode = RecordingMode.ALWAYS;
			}

			axios
				.post(this.OPENVIDU_URL + '/openvidu/api/sessions', JSON.stringify(properties), {
					headers: {
						Authorization: 'Basic ' + btoa('OPENVIDUAPP:' + this.OPENVIDU_SECRET),
						'Content-Type': 'application/json',
					},
					httpsAgent: new https.Agent({
						rejectUnauthorized: false,
					}),
				})
				.then((response: any) => {
					resolve(response.data.id);
				})
				.catch((response) => {
					var error = Object.assign({}, response);
					if (error.response && error.response.status === 409) {
						resolve(sessionId);
					} else {
						console.warn('No connection to OpenVidu Server. This may be a certificate error at ' + this.OPENVIDU_URL);
						reject(error.response);
					}
				});
		});
	}

	private createToken(sessionId: string, role: OpenViduRole): Promise<string> {
		return new Promise((resolve, reject) => {
			const data = JSON.stringify({
				type: 'WEBRTC',
				record: false,
				role: role,
			});
			axios
				.post(this.OPENVIDU_URL + '/openvidu/api/sessions/' + sessionId + '/connection', data, {
					headers: {
						Authorization: 'Basic ' + btoa('OPENVIDUAPP:' + this.OPENVIDU_SECRET),
						'Content-Type': 'application/json',
					},
					httpsAgent: new https.Agent({
						rejectUnauthorized: false,
					}),
				})
				.then((response: any) => {
					resolve(response.data.token);
				})
				.catch((error) => reject(error.response));
		});
	}
}
