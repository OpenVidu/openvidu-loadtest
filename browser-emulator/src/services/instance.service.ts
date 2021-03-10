import * as os  from 'node-os-utils';
import { APPLICATION_MODE } from '../config';
import { ApplicationMode } from '../types/config.type';
import { DockerService } from './docker.service';

export class InstanceService {

	private static instance: InstanceService;
	private containerId: string;
	private readonly METRICBEAT_CONTAINER_NAME = 'metricbeat';

	private constructor(
		private dockerService: DockerService = new DockerService()

	) {}

	static getInstance(): InstanceService {
		if (!InstanceService.instance) {
			InstanceService.instance = new InstanceService();
		}
		return InstanceService.instance;
	}

	async cleanEnvironment() {
		await this.dockerService.stopContainer(this.METRICBEAT_CONTAINER_NAME);
	}


	async getCpuUsage(): Promise<number> {
		const cpuUsage: number = await os.cpu.usage();
		return cpuUsage;
	}

	async launchMetricBeat() {
		if(!this.isMetricbeatStarted() && APPLICATION_MODE === ApplicationMode.PROD) {
			try {
				this.containerId = await this.dockerService.startMetricBeat(this.METRICBEAT_CONTAINER_NAME);
			} catch (error) {
				console.error(error);
				this.dockerService.stopContainer(this.containerId);
			}
		}
	}

	async stopMetricBeat() {
		await this.dockerService.stopContainer(this.containerId);
		this.containerId = '';
	}

	isMetricbeatStarted(): boolean {
		return !!this.containerId;
	}

}