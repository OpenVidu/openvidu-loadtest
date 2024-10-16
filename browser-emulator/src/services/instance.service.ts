import * as os from 'node-os-utils';
import { ContainerCreateOptions } from 'dockerode';
import { DockerService } from './docker.service';
import { LocalStorageService } from './local-storage.service';
import { WebrtcStatsService } from './config-storage.service';
import { ContainerName } from '../types/container-info.type';

export class InstanceService {
	private static instance: InstanceService;
	private isinstanceInitialized: boolean = false;
	private readonly METRICBEAT_MONITORING_INTERVAL = 5;
	private readonly METRICBEAT_IMAGE = 'docker.elastic.co/beats/metricbeat-oss:7.12.0';
	private readonly METRICBEAT_YML_LOCATION = `${process.cwd()}/src/assets/metricbeat-config/metricbeat.yml`;

	readonly WORKER_UUID: string = new Date().getTime().toString();
	private pullImagesRetries: number = 0;

	private constructor(private dockerService: DockerService = new DockerService()) {}

	static getInstance(): InstanceService {
		if (!InstanceService.instance) {
			InstanceService.instance = new InstanceService();
		}
		return InstanceService.instance;
	}

	isInstanceInitialized() {
		return this.isinstanceInitialized;
	}

	instanceInitialized() {
		this.isinstanceInitialized = true;
	}

	async cleanEnvironment() {
		new LocalStorageService().clear(new WebrtcStatsService().getItemName());
	}

	async getCpuUsage(): Promise<number> {
		return await os.cpu.usage();
	}

	async launchMetricBeat() {
		const ELASTICSEARCH_USERNAME = !!process.env.ELASTICSEARCH_USERNAME ? process.env.ELASTICSEARCH_USERNAME : 'empty';
		const ELASTICSEARCH_PASSWORD = !!process.env.ELASTICSEARCH_PASSWORD ? process.env.ELASTICSEARCH_PASSWORD : 'empty';
		const options: ContainerCreateOptions = {
			Image: this.METRICBEAT_IMAGE,
			name: ContainerName.METRICBEAT,
			User: 'root',
			Env: [
				`ELASTICSEARCH_HOSTNAME=${process.env.ELASTICSEARCH_HOSTNAME}`,
				`ELASTICSEARCH_USERNAME=${ELASTICSEARCH_USERNAME}`,
				`ELASTICSEARCH_PASSWORD=${ELASTICSEARCH_PASSWORD}`,
				`METRICBEAT_MONITORING_INTERVAL=${this.METRICBEAT_MONITORING_INTERVAL}`,
				`WORKER_UUID=${this.WORKER_UUID}`,
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
				NetworkMode: 'browseremulator',
			},
		};
		await this.dockerService.startContainer(options);
	}

	async removeContainer(containerNameOrId: string) {
		await this.dockerService.removeContainer(containerNameOrId);
	}

	async pullImagesNeeded(): Promise<void> {
		try {
			if (!(await this.dockerService.imageExists(this.METRICBEAT_IMAGE))) {
				await this.dockerService.pullImage(this.METRICBEAT_IMAGE);
			}
		} catch (err) {
			console.error("Error pulling images: ");
			console.error(err);
			console.log("Retrying...");
			// retry 5 times
			if (this.pullImagesRetries < 5) {
				this.pullImagesRetries++;
				await this.pullImagesNeeded();
			} else {
				this.pullImagesRetries = 0;
				throw err;
			}
		}
	}

}
