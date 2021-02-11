import { OpenViduRole } from './openvidu.type';

export interface BrowserContainerInfo {
	bindedPort: number;
	connectionRole: OpenViduRole
}