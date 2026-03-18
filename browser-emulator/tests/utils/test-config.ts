export const OPENVIDU_URL =
	process.env.TEST_OPENVIDU_URL ?? 'http://localhost:4443';
export const OPENVIDU_SECRET = process.env.TEST_OPENVIDU_SECRET ?? '';

export function getOpenViduConfig() {
	return {
		openviduUrl: OPENVIDU_URL,
		openviduSecret: OPENVIDU_SECRET,
	};
}
