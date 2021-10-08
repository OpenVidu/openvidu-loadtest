import * as os  from 'node-os-utils';
import { ContainerCreateOptions } from "dockerode";

import { APPLICATION_MODE, SERVER_PORT } from '../config';
import { ApplicationMode } from '../types/config.type';
import { DockerService } from './docker.service';

export class InstanceService {

	private static instance: InstanceService;
	private containerId: string;
	private readonly CHROME_BROWSER_IMAGE = "elastestbrowsers/chrome";

	private readonly METRICBEAT_CONTAINER_NAME = 'metricbeat';
	private readonly METRICBEAT_MONITORING_INTERVAL = 1;
	private readonly METRICBEAT_IMAGE = "docker.elastic.co/beats/metricbeat-oss:7.8.0";
	private readonly METRICBEAT_YML_LOCATION = `${process.env.PWD}/src/assets/metricbet-config/metricbeat.yml`;


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
		const ELASTICSEARCH_USERNAME = !!process.env.ELASTICSEARCH_USERNAME ? process.env.ELASTICSEARCH_USERNAME : 'empty';
		const ELASTICSEARCH_PASSWORD = !!process.env.ELASTICSEARCH_PASSWORD ? process.env.ELASTICSEARCH_PASSWORD : 'empty';
		const options: ContainerCreateOptions = {
			Image: this.METRICBEAT_IMAGE,
			name: 'metricbeat',
			User: 'root',
			Env: [
				`ELASTICSEARCH_HOSTNAME=${process.env.ELASTICSEARCH_HOSTNAME}`,
				`ELASTICSEARCH_USERNAME=${ELASTICSEARCH_USERNAME}`,
				`ELASTICSEARCH_PASSWORD=${ELASTICSEARCH_PASSWORD}`,
				`METRICBEAT_MONITORING_INTERVAL=${this.METRICBEAT_MONITORING_INTERVAL}`,
				// `WORKER_UUID=${this.WORKER_UUID}`,
			],
			Cmd: ['/bin/bash', '-c', 'metricbeat -e -strict.perms=false -e -system.hostfs=/hostfs'],
			HostConfig: {
				Binds: [
					`/var/run/docker.sock:/var/run/docker.sock`,
					`${this.METRICBEAT_YML_LOCATION}:/usr/share/metricbeat/metricbeat.yml:ro`,
					'/proc:/hostfs/proc:ro',
					'/sys/fs/cgroup:/hostfs/sys/fs/cgroup:ro',
					'/:/hostfs:ro',
				],
				NetworkMode: 'host',
			},
		};
		await this.dockerService.startContainer(options);
	}

	async removeContainer(containerNameOrId: string) {
		await this.dockerService.removeContainer(containerNameOrId);
	}


	async stopMetricBeat() {
		await this.dockerService.stopContainer(this.containerId);
		this.containerId = '';
	}

	isMetricbeatStarted(): boolean {
		return !!this.containerId;
	}

	async pullImagesNeeded() {
		if (!(await this.dockerService.imageExists(this.METRICBEAT_IMAGE))) {
			await this.dockerService.pullImage(this.METRICBEAT_IMAGE);
		}
		if (!(await this.dockerService.imageExists(this.CHROME_BROWSER_IMAGE))) {
			await this.dockerService.pullImage(this.CHROME_BROWSER_IMAGE);
		}
	}

}
