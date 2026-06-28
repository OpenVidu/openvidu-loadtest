import Docker from 'dockerode';
import fs from 'node:fs';
import path from 'node:path';
import logger from './logger.service.ts';
import { sanitizeFilename } from '../utils/sanitize.ts';

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

	public async ensureNetworkExists(networkName: string): Promise<void> {
		const networks = await this.docker.listNetworks({
			filters: { name: [networkName] },
		});
		if (networks.length === 0) {
			await this.docker.createNetwork({ Name: networkName });
			logger.info('Docker network %s created', networkName);
		} else {
			logger.info('Docker network %s already exists', networkName);
		}
	}

	async startContainer(
		options: Docker.ContainerCreateOptions,
	): Promise<string> {
		logger.info('Starting %s', options.Image);
		const container: Docker.Container =
			await this.docker.createContainer(options);
		await container.start();
		logger.info('%s started: %s', options.Image, container.id);
		return container.id;
	}

	async runAndWaitContainer(
		options: Docker.ContainerCreateOptions,
	): Promise<[number, string]> {
		logger.info('Running %s and waiting for completion', options.Image);
		const container: Docker.Container =
			await this.docker.createContainer(options);
		await container.start();
		logger.info('%s started: %s', options.Image, container.id);

		const waitResult = (await container.wait()) as {
			StatusCode: number;
			Error?: string;
		};
		const exitCode = waitResult.StatusCode;
		logger.info('%s exited with code %d', options.Image, exitCode);

		const logs = await container.logs({
			stdout: true,
			stderr: true,
		});
		const logsString = logs.toString();
		logger.info('Logs from %s:\n%s', options.Image, logsString);
		return [exitCode, logsString];
	}

	public async streamContainerLogs(
		nameOrId: string,
		destPath: string,
	): Promise<void> {
		const container = await this.getContainerByIdOrName(nameOrId);
		if (!container) {
			logger.error('Container %s does not exist', nameOrId);
			return;
		}

		const logsDir = path.dirname(destPath);
		const safeLogsDir = logsDir.replace(/[^a-zA-Z0-9_/\\:-]/g, '');
		const safeDestPath = path.join(
			safeLogsDir,
			sanitizeFilename(path.basename(destPath)),
		);

		try {
			await fs.promises.mkdir(path.dirname(safeDestPath), {
				recursive: true,
			});
		} catch {
			// ignore mkdir errors, will fail on write if needed
		}

		const writeStream = fs.createWriteStream(safeDestPath, { flags: 'a' });
		writeStream.on('error', err => {
			logger.error(
				{ err },
				'Error writing selenium container logs to file',
			);
		});

		// Request the logs stream and pipe to file. follow=true keeps streaming until container stops.
		const logStream: NodeJS.ReadableStream = await container.logs({
			stdout: true,
			stderr: true,
			follow: true,
			since: 0,
			timestamps: true,
		});

		// Some dockerode streams are multiplexed and need demuxing; attempt to demux if available.
		const maybeModem = (
			container as unknown as {
				modem?: {
					demuxStream?: (
						stream: NodeJS.ReadableStream,
						stdout: NodeJS.WritableStream,
						stderr: NodeJS.WritableStream,
					) => void;
				};
			}
		).modem;
		if (maybeModem && typeof maybeModem.demuxStream === 'function') {
			try {
				maybeModem.demuxStream(logStream, writeStream, writeStream);
			} catch {
				logStream.pipe(writeStream);
			}
		} else {
			logStream.pipe(writeStream);
		}

		// When the stream ends, close the file
		logStream.on('end', () => writeStream.end());
		logStream.on('error', () => writeStream.end());
	}

	public async stopContainer(nameOrId: string): Promise<void> {
		const container = await this.getContainerByIdOrName(nameOrId);
		if (!container) {
			logger.error('Container %s does not exist, skipping', nameOrId);
			return;
		}
		try {
			await container.stop();
			logger.info('Container %s stopped', container.id);
		} catch (error: unknown) {
			if (error instanceof Error) {
				logger.warn(
					'Container has already stopped. Skipping (%s)',
					error.message,
				);
			} else {
				logger.error(
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
				logger.info('Container %s removed', containerNameOrId);
			} catch {
				logger.error('Container %s does not exist', containerNameOrId);
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
			logger.info(
				'    Downloading layer %s: %s',
				event.id,
				event.progress,
			);
		} else if (event.status === 'Download complete') {
			logger.info('    Layer %s downloaded!', event.id);
		}
	}

	public async pullImage(image: string): Promise<void> {
		return new Promise((resolve, reject) => {
			function onFinished(err: Error | null) {
				if (err) {
					reject(err);
				} else {
					logger.info('Image %s successfully pulled', image);
					resolve();
				}
			}
			logger.info('Pulling image %s', image);
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
				logger.info(
					'Container %s successfully executed command %s',
					containerId,
					command,
				);
			} catch (error) {
				logger.error(error);
			}
		} else {
			logger.error('Container %s does not exist', containerId);
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

	async getLogsFromContainer(nameOrId: string): Promise<string> {
		const container = await this.getContainerByIdOrName(nameOrId);
		if (!container) {
			logger.error('Container %s does not exist', nameOrId);
			throw new Error('Container ' + nameOrId + ' not found');
		}

		const logs = await container.logs({
			stdout: true,
			stderr: true,
		});
		return logs.toString();
	}

	async isContainerRunning(nameOrId: string): Promise<boolean> {
		const container = await this.getContainerByIdOrName(nameOrId);
		if (!container) {
			logger.error('Container %s does not exist', nameOrId);
			return false;
		}
		const containerInfo = await container.inspect();
		return containerInfo.State.Running;
	}
}
