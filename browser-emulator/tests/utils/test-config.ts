import https from 'node:https';
import http from 'node:http';

export const RUNNING_IN_DOCKER = process.env.RUNNING_IN_DOCKER === 'true';
const openviduUrl = process.env.TEST_OPENVIDU_URL ?? 'http://localhost:4443';
const livekitUrl = process.env.TEST_LIVEKIT_URL ?? 'http://localhost:7880';
export const OPENVIDU_URL = openviduUrl;
export const OPENVIDU_SECRET = process.env.TEST_OPENVIDU_SECRET ?? 'MY_SECRET';
export const LIVEKIT_URL = livekitUrl;
export const LIVEKIT_API_KEY = process.env.TEST_LIVEKIT_API_KEY ?? 'devkey';
export const LIVEKIT_API_SECRET =
	process.env.TEST_LIVEKIT_API_SECRET ?? 'secret';

export function getConfig() {
	return {
		openviduUrl: OPENVIDU_URL,
		openviduSecret: OPENVIDU_SECRET,
		livekitUrl: LIVEKIT_URL,
		livekitApiKey: LIVEKIT_API_KEY,
		livekitApiSecret: LIVEKIT_API_SECRET,
	};
}

export async function checkDeploymentReachable(
	url: string,
	timeoutMs = 15000,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const mod = url.startsWith('https') ? https : http;
		const req = mod.get(url, { rejectUnauthorized: false }, res => {
			res.resume();
			resolve();
		});
		req.on('error', err =>
			reject(
				new Error(
					`Deployment ${url} is not reachable: ${err.message}. Make sure the platform server is running and accessible.`,
				),
			),
		);
		req.setTimeout(timeoutMs, () => {
			req.destroy();
			reject(
				new Error(
					`Deployment ${url} timed out after ${timeoutMs}ms. Make sure the platform server is running and accessible.`,
				),
			);
		});
	});
}
