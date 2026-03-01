import { OpenViduRole } from './openvidu.type.js';

export const ContainerName = {
	METRICBEAT: 'metricbeat',
} as const;

export type ContainerName = (typeof ContainerName)[keyof typeof ContainerName];

export interface BrowserCContainerInfo {
	containerName: string;
	bindedPort: number;
	connectionRole: OpenViduRole;
	isRecording: boolean;
	sessionName: string;
}
