import { OpenViduRole } from './openvidu.type';


export enum ContainerName {
	METRICBEAT = 'metricbeat',
	KMS = 'kms',
}

export interface BrowserContainerInfo {
	containerName: string;
	bindedPort: number;
	connectionRole: OpenViduRole;
	isRecording: boolean;
	sessionName: string;
}