import * as Docker from 'dockerode';

export class DockerService {
	private docker: Docker;

	constructor() {
		this.docker = new Docker();
	}

	async startContainer(options: Docker.ContainerCreateOptions): Promise<string> {
		console.log(`Starting ${options.Image}`);
		const container: Docker.Container = await this.docker.createContainer(options);
		await container.start();
		console.log(`${options.Image} started: ${container.id}`);
		return container.id;
	}

	public async stopContainer(nameOrId: string): Promise<void> {
		const container = await this.getContainerByIdOrName(nameOrId);
		if (!!container) {
			try {
				await container.stop();
				console.log('Container ' + container.id + ' stopped');
			} catch (error) {
				console.error('KMS has already stopped. Skipping');
			}
		}
	}

	public async removeContainer(containerNameOrId: string) {
		const container = await this.getContainerByIdOrName(containerNameOrId);
		if (!!container) {
			try {
				await container.remove({ force: true });
				console.log('Container ' + containerNameOrId + ' removed');
			} catch (error) {
				console.error('Container ' + containerNameOrId + ' does not exist');
			}
		}
	}

	async imageExists(image: string): Promise<boolean> {
		const imageNamesArr: string[] = [image];
		const images = await this.docker.listImages({
			filters: { reference: imageNamesArr },
		});
		return images.length > 0;
	}

	pullImage(image: string): Promise<void> {
		return new Promise(async (resolve, reject) => {
			console.log('Pulling image ' + image);
			this.docker.pull(image, (err, stream) => {
				function onFinished(err) {
					if (!!err) {
						reject(err);
					} else {
						console.log('Image ' + image + ' successfully pulled');
						resolve();
					}
				}
				function onProgress(event) {
					if (event.status === 'Downloading') {
						console.log('    Downloading layer ' + event.id + ': ' + event.progress);
					} else if (event.status === 'Download complete') {
						console.log('    Layer ' + event.id + ' downloaded!');
					}
				}
				try {
					if (!!err) {
						reject(err);
					}
					if (stream === null) {
						reject('No stream');
					}
					this.docker.modem.followProgress(stream, onFinished, onProgress);
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	async runCommandInContainer(containerId: string, command: string): Promise<void> {
		const container = this.docker.getContainer(containerId);
		if (!!container) {
			try {
				const exec = await container.exec({
					AttachStdout: true,
					AttachStderr: true,
					Cmd: ['/bin/bash', '-c', command],
					Privileged: true,
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
			return containerInfo.Names.indexOf('/' + nameOrId) >= 0 || containerInfo.Id === nameOrId;
		});

		if (!!containerInfo && containerInfo?.Id) {
			return this.docker.getContainer(containerInfo.Id);
		}
	}
}
