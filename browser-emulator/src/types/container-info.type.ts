import { OpenViduRole } from './openvidu.type';


export enum ContainerName {
	METRICBEAT = 'metricbeat',
	KMS = 'kms',
}

export interface BrowserContainerInfo {
	bindedPort: number;
	connectionRole: OpenViduRole;
	isRecording: boolean;
	sessionName: string;
}