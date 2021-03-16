import * as os  from 'node-os-utils';
import { ContainerCreateOptions } from "dockerode";

import { APPLICATION_MODE, EMULATED_USER_TYPE, SERVER_PORT } from '../config';
import { ApplicationMode, EmulatedUserType } from '../types/config.type';
import { DockerService } from './docker.service';
import { LocalStorageService } from './local-storage.service';
import { WebrtcStatsService } from './webrtc-stats-storage.service';

export class InstanceService {

	private static instance: InstanceService;
	private metricbeatContainerId: string;
	private kmsContainerId: string;

	private readonly CHROME_BROWSER_IMAGE = 'elastestbrowsers/chrome';
	private readonly METRICBEAT_CONTAINER_NAME = 'metricbeat';
	private readonly METRICBEAT_MONITORING_INTERVAL = 1;
	private readonly METRICBEAT_IMAGE = 'docker.elastic.co/beats/metricbeat-oss:7.8.0';
	private readonly METRICBEAT_YML_LOCATION = `${process.env.PWD}/src/assets/metricbet-config/metricbeat.yml`;

	private readonly KMS_CONTAINER_NAME = 'kms';
	private readonly KMS_IMAGE = 'kurento/kurento-media-server:latest';
	private readonly KMS_RECORDINGS_PATH = '/home/ubuntu/recordings';
	private readonly KMS_MEDIAFILES_PATH = '/home/ubuntu/mediafiles';

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
		await this.dockerService.stopContainer(this.KMS_CONTAINER_NAME);
		new LocalStorageService().clear(new WebrtcStatsService().getItemName());
	}


	async getCpuUsage(): Promise<number> {
		const cpuUsage: number = await os.cpu.usage();
		return cpuUsage;
	}

	async launchMetricBeat() {
		if(!this.isMetricbeatStarted() && APPLICATION_MODE === ApplicationMode.PROD) {
			try {

				const ELASTICSEARCH_USERNAME = !!process.env.ELASTICSEARCH_USERNAME ? process.env.ELASTICSEARCH_USERNAME : 'empty';
				const ELASTICSEARCH_PASSWORD = !!process.env.ELASTICSEARCH_PASSWORD ? process.env.ELASTICSEARCH_PASSWORD : 'empty';
				const options: ContainerCreateOptions = {
					Image: this.METRICBEAT_IMAGE,
					name: this.METRICBEAT_CONTAINER_NAME,
					User: 'root',
					Env: [
						`ELASTICSEARCH_HOSTNAME=${process.env.ELASTICSEARCH_HOSTNAME}`,
						`ELASTICSEARCH_USERNAME=${ELASTICSEARCH_USERNAME}`,
						`ELASTICSEARCH_PASSWORD=${ELASTICSEARCH_PASSWORD}`,
						`METRICBEAT_MONITORING_INTERVAL=${this.METRICBEAT_MONITORING_INTERVAL}`,
						`WORKER_PORT=${SERVER_PORT}`,
					],
					Cmd: ['/bin/bash', '-c', 'metricbeat -e -strict.perms=false -e -system.hostfs=/hostfs'],
					HostConfig:  {
						Binds: [
							`/var/run/docker.sock:/var/run/docker.sock`,
							`${this.METRICBEAT_YML_LOCATION}:/usr/share/metricbeat/metricbeat.yml:ro`,
							'/proc:/hostfs/proc:ro',
							'/sys/fs/cgroup:/hostfs/sys/fs/cgroup:ro',
							'/:/hostfs:ro'
						],
						NetworkMode: 'host'
					},
				};
				this.metricbeatContainerId = await this.dockerService.startContainer(options);
			} catch (error) {
				console.error(error);
				this.dockerService.stopContainer(this.metricbeatContainerId);
				this.metricbeatContainerId = '';
			}
		}
	}

	async launchKMS(): Promise<void> {
		try {
			const options: ContainerCreateOptions = {
				Image: this.KMS_IMAGE,
				name: this.KMS_CONTAINER_NAME,
				User: 'root',
				Env: [
					'KMS_MIN_PORT=40000',
     				'KMS_MAX_PORT=65535',
					`KURENTO_RECORDING_ENABLED=${process.env.KURENTO_RECORDING_ENABLED}`
				],
				HostConfig:  {
					Binds: [
						`${process.env.PWD}/recordings/kms:${this.KMS_RECORDINGS_PATH}`,
						`${process.env.PWD}/src/assets/mediafiles:${this.KMS_MEDIAFILES_PATH}`
					],
					AutoRemove: false,
					NetworkMode: 'host',
					RestartPolicy: {
						"Name": "always"
					}
				},
			};
			this.kmsContainerId = await this.dockerService.startContainer(options);
		} catch (error) {
			console.error(error);
			this.dockerService.stopContainer(this.kmsContainerId);
			this.kmsContainerId = '';
		}
	}

	isMetricbeatStarted(): boolean {
		return !!this.metricbeatContainerId;
	}

	async pullImagesNeeded(): Promise<void> {
		if (!(await this.dockerService.imageExists(this.METRICBEAT_IMAGE))) {
			await this.dockerService.pullImage(this.METRICBEAT_IMAGE);
		}
		if (!(await this.dockerService.imageExists(this.CHROME_BROWSER_IMAGE))) {
			await this.dockerService.pullImage(this.CHROME_BROWSER_IMAGE);
		}
		if (!(await this.dockerService.imageExists(this.KMS_IMAGE)) && EMULATED_USER_TYPE === EmulatedUserType.KMS) {
			await this.dockerService.pullImage(this.KMS_IMAGE);
		}
	}

}