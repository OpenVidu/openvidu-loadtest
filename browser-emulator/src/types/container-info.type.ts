import { Role } from '../types/create-user.type.ts';
export const ContainerName = {
	METRICBEAT: 'metricbeat',
} as const;

export type ContainerName = (typeof ContainerName)[keyof typeof ContainerName];

export interface BrowserCContainerInfo {
	containerName: string;
	bindedPort: number;
	connectionRole: Role;
	isRecording: boolean;
	sessionName: string;
}
