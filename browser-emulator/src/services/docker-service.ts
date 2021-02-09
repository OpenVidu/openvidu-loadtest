import * as Docker from "dockerode";
import { PublisherProperties } from "../extra/openvidu-browser/OpenVidu/OpenviduTypes";

export class DockerService {
	private docker: Docker;

	private readonly CHROME_BROWSER_IMAGE = "elastestbrowsers/chrome";

	constructor() {
		this.docker = new Docker();
	}

	public async startBrowserContainer(name: string, hostPort: number, properties: PublisherProperties): Promise<string> {
		const options: Docker.ContainerCreateOptions = {
			Image: this.CHROME_BROWSER_IMAGE,
			name: name,
			ExposedPorts: {
				"4444/tcp": {},
			  },
			HostConfig:  {
				Binds: [
					`${process.env.PWD}/recordings:/home/ubuntu/recordings`
				],
				PortBindings: { "4444/tcp": [{ "HostPort": hostPort.toString(), "HostIp": "0.0.0.0" }] },
				CapAdd: [
					'SYS_ADMIN'
				]
			}
		};

		if (!(await this.imageExists(options.Image))) {
			await this.pullImage(options.Image);
		}
		const container: Docker.Container = await this.docker.createContainer(options);
		await container.start();
		console.log("Container running: " + container.id);

		return container.id;
	}

	public async runCommandInContainer(containerId: string, command: string): Promise<void> {
        const container = this.getContainerById(containerId);
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

	public async stopContainer(containerId: string): Promise<void> {
	    const container = this.getContainerById(containerId);
	    if (!!container) {
			await this.stopBrowserRecording(container.id);
	        await container.stop();
	        console.log('Container ' + containerId + ' stopped');
	    } else {
	        throw 'Container ' + containerId + ' does not exist'
	    }
	}

	private getContainerById(containerId: string): Docker.Container {
		return this.docker.getContainer(containerId);
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

	async startBrowserRecording(containerId: string, videoName: string): Promise<void> {
		const startRecordingCommand = "start-video-recording.sh -n " + videoName;
		await this.runCommandInContainer(containerId, startRecordingCommand);
	}

	private async stopBrowserRecording(containerId: string): Promise<void> {
		const stopRecordingCommand = 'stop-video-recording.sh';
		await this.runCommandInContainer(containerId, stopRecordingCommand);
	}


}
