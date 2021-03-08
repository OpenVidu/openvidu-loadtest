import * as Docker from "dockerode";
import { SERVER_PORT } from '../config';

export class DockerService {
	private docker: Docker;
	private readonly CHROME_BROWSER_IMAGE = "elastestbrowsers/chrome";
	private readonly METRICBEAT_IMAGE = "docker.elastic.co/beats/metricbeat-oss:7.8.0";
	private readonly METRICBEAT_YML_LOCATION = `${process.env.PWD}/src/assets/metricbet-config/metricbeat.yml`;
	private readonly METRICBEAT_MONITORING_INTERVAL = 5;
	private readonly RECORDINGS_PATH = '/home/ubuntu/recordings';
	private readonly MEDIA_FILES_PATH = '/home/ubuntu/mediafiles';

	constructor() {
		this.docker = new Docker();
	}

	async startMetricBeat(name: string) {
		console.log("Starting metricbeat");
		const ELASTICSEARCH_USERNAME = !!process.env.ELASTICSEARCH_USERNAME ? process.env.ELASTICSEARCH_USERNAME : 'empty';
		const ELASTICSEARCH_PASSWORD = !!process.env.ELASTICSEARCH_PASSWORD ? process.env.ELASTICSEARCH_PASSWORD : 'empty';
		const options: Docker.ContainerCreateOptions = {
			Image: this.METRICBEAT_IMAGE,
			name: name,
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

		const container: Docker.Container = await this.docker.createContainer(options);
		await container.start();
		console.log("Metricbeat started: ", container.id);
		return container.id;
	}

	public async startBrowserContainer(name: string, hostPort: number, recording: boolean): Promise<string> {
		const options: Docker.ContainerCreateOptions = {
			Image: this.CHROME_BROWSER_IMAGE,
			name: name,
			ExposedPorts: {
				"4444/tcp": {},
			},
			HostConfig:  {
				Binds: [
					`${process.env.PWD}/recordings:${this.RECORDINGS_PATH}`,
					`${process.env.PWD}/src/assets/mediafiles:${this.MEDIA_FILES_PATH}`,
				],
				PortBindings: { "4444/tcp": [{ "HostPort": hostPort.toString(), "HostIp": "0.0.0.0" }] },
				CapAdd: [
					'SYS_ADMIN'
				]
			}
		};

		const container: Docker.Container = await this.docker.createContainer(options);
		await container.start();
		await this.enableMediaFileAccess(container.id);
		if (recording) {
			console.log("Starting browser recording");
			await this.startRecordingInContainer(container.id, name);
		}
		console.log("Container running: " + container.id);
		return container.id;
	}

	public async stopContainer(nameOrId: string, recording?: boolean): Promise<void> {
		const container = await this.getContainerByIdOrName(nameOrId);
	    if (!!container) {
			if(recording) {
				await this.stopRecordingInContainer(container.id);
			}
			try {
				await container.stop();
			} catch (error) {

			}
			// await this.removeContainer(container.id);
			await container.remove({ force: true });
	        console.log('Container ' + container.id + ' stopped');
		}
		else {
	        console.error('Container ' + nameOrId + ' does not exist');
	    }
	}

	async pullImagesNeeded() {
		if (!(await this.imageExists(this.METRICBEAT_IMAGE))) {
			await this.pullImage(this.METRICBEAT_IMAGE);
		}
		if (!(await this.imageExists(this.CHROME_BROWSER_IMAGE))) {
			await this.pullImage(this.CHROME_BROWSER_IMAGE);
		}
	}

	private async enableMediaFileAccess(containerId: any) {
		const command = `sudo chmod 777 ${this.MEDIA_FILES_PATH}`;
		await this.runCommandInContainer(containerId, command);
	}

	private async startRecordingInContainer(containerId: string, videoName: string): Promise<void> {
		const startRecordingCommand = "start-video-recording.sh -n " + videoName;
		await this.runCommandInContainer(containerId, startRecordingCommand);
	}

	private async stopRecordingInContainer(containerId: string): Promise<void> {
		const stopRecordingCommand = 'stop-video-recording.sh';
		await this.runCommandInContainer(containerId, stopRecordingCommand);
	}

	async runCommandInContainer(containerId: string, command: string): Promise<void> {
        const container = this.docker.getContainer(containerId);
        if (!!container) {

			try {
				const exec = await container.exec({
					AttachStdout: true,
					AttachStderr: true,
					Cmd: ['/bin/bash', '-c', command],
					Privileged: true
				});
				await exec.start({});
				console.log('Container ' + containerId + ' successfully executed command ' + command);

			} catch (error) {
				console.error(error);
			}

        } else {
            console.error('Container ' + containerId + ' does not exist');
		}
	}

	private async getContainerByIdOrName(nameOrId: string): Promise<Docker.Container> {
		const containers: Docker.ContainerInfo[] = await this.docker.listContainers({ all: true });
		const containerInfo = containers.find((containerInfo: Docker.ContainerInfo) => {
			return containerInfo.Names.indexOf("/" + nameOrId) >= 0 || containerInfo.Id === nameOrId;
		});

		if(!!containerInfo && containerInfo?.Id) {
			return this.docker.getContainer(containerInfo.Id);
		}
	}

	private async imageExists(image: string): Promise<boolean> {
		const imageNamesArr: string[] = [image];
		const images = await this.docker.listImages({
			filters: { reference: imageNamesArr },
		});
		return images.length > 0;
	}

	private pullImage(image: string): Promise<void> {
		return new Promise(async (resolve, reject) => {
			console.log("Pulling image " + image);
			this.docker.pull(image, (err, stream) => {
				function onFinished(err) {
					if (!!err) {
						reject(err);
					} else {
						console.log("Image " + image + " successfully pulled");
						resolve();
					}
				}
				function onProgress(event) {
					if (event.status === "Downloading") {
						console.log(
							"    Downloading layer " + event.id + ": " + event.progress
						);
					} else if (event.status === "Download complete") {
						console.log("    Layer " + event.id + " downloaded!");
					}
				}
				try {
					this.docker.modem.followProgress(stream, onFinished, onProgress);
				} catch (error) {
					reject(error);
				}
			});
		});
	}


}
