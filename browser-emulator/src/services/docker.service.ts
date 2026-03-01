import Docker from 'dockerode';

interface PullProgressEvent {
	status: string;
	id: string;
	progress: string;
}

export class DockerService {
	private readonly docker: Docker;

	constructor() {
		this.docker = new Docker();
	}

	async startContainer(
		options: Docker.ContainerCreateOptions,
	): Promise<string> {
		console.log(`Starting ${options.Image}`);
		const container: Docker.Container =
			await this.docker.createContainer(options);
		await container.start();
		console.log(`${options.Image} started: ${container.id}`);
		return container.id;
	}

	public async stopContainer(nameOrId: string): Promise<void> {
		const container = await this.getContainerByIdOrName(nameOrId);
		if (!container) {
			console.error(
				'Container ' + nameOrId + ' does not exist, skipping',
			);
			return;
		}
		try {
			await container.stop();
			console.log('Container ' + container.id + ' stopped');
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.warn(
					'Container has already stopped. Skipping (' +
						error.message +
						')',
				);
			} else {
				console.error(
					'Container has already stopped. Skipping (unknown error)',
				);
			}
		}
	}

	public async removeContainer(containerNameOrId: string): Promise<void> {
		const container = await this.getContainerByIdOrName(containerNameOrId);
		if (container) {
			try {
				await container.remove({ force: true });
				console.log('Container ' + containerNameOrId + ' removed');
			} catch {
				console.error(
					'Container ' + containerNameOrId + ' does not exist',
				);
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

	private onPullProgress(this: void, event: PullProgressEvent) {
		if (event.status === 'Downloading') {
			console.log(
				'    Downloading layer ' + event.id + ': ' + event.progress,
			);
		} else if (event.status === 'Download complete') {
			console.log('    Layer ' + event.id + ' downloaded!');
		}
	}

	async pullImage(image: string): Promise<void> {
		return new Promise((resolve, reject) => {
			function onFinished(err: Error | null) {
				if (err) {
					reject(err);
				} else {
					console.log('Image ' + image + ' successfully pulled');
					resolve();
				}
			}
			console.log('Pulling image ' + image);
			void this.docker.pull(
				image,
				(err: Error, stream: NodeJS.ReadableStream) => {
					if (err) {
						reject(err);
					}
					if (stream === null) {
						reject(new Error('No stream'));
					}
					this.docker.modem.followProgress(
						stream,
						onFinished,
						this.onPullProgress,
					);
				},
			);
		});
	}

	async runCommandInContainer(
		containerId: string,
		command: string,
	): Promise<void> {
		const container = this.docker.getContainer(containerId);
		if (container) {
			try {
				const exec = await container.exec({
					AttachStdout: true,
					AttachStderr: true,
					Cmd: ['/bin/bash', '-c', command],
					Privileged: true,
				});
				await exec.start({});
				console.log(
					'Container ' +
						containerId +
						' successfully executed command ' +
						command,
				);
			} catch (error) {
				console.error(error);
			}
		} else {
			console.error('Container ' + containerId + ' does not exist');
		}
	}

	async getContainerByIdOrName(
		nameOrId: string,
	): Promise<Docker.Container | undefined> {
		const containers: Docker.ContainerInfo[] =
			await this.docker.listContainers({ all: true });
		const containerInfo = containers.find(
			(containerInfo: Docker.ContainerInfo) => {
				return (
					containerInfo.Names.includes('/' + nameOrId) ||
					containerInfo.Id === nameOrId
				);
			},
		);

		if (!!containerInfo && containerInfo?.Id) {
			return this.docker.getContainer(containerInfo.Id);
		}
	}
}
