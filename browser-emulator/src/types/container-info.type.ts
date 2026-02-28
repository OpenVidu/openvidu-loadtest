import { OpenViduRole } from './openvidu.type.js';


export enum ContainerName {
	METRICBEAT = 'metricbeat',
}

export interface BrowserContainerInfo {
	containerName: string;
	bindedPort: number;
	connectionRole: OpenViduRole;
	isRecording: boolean;
	sessionName: string;
}