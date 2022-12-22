import fs = require('fs');
import os = require('os');
import { Browser, Builder, By, Capabilities, until, WebDriver, logging } from 'selenium-webdriver';
import chrome = require('selenium-webdriver/chrome');
import { LoadTestPostRequest, TestProperties } from '../types/api-rest.type';
import { OpenViduRole } from '../types/openvidu.type';
import { ErrorGenerator } from '../utils/error-generator';
import { DockerService } from './docker.service';
import { ContainerCreateOptions } from 'dockerode';
import { Storage } from './local-storage.service';
import { StorageNameObject, StorageValueObject } from '../types/storage-config.type';
import { DOCKER_NAME } from '../config';
declare var localStorage: Storage;
export class RealBrowserService {
	private connections: Map<string, { publishers: string[]; subscribers: string[] }> = new Map();

	private readonly BROWSER_CONTAINER_HOSTPORT = 4444;
	private readonly BROWSER_WAIT_TIMEOUT_MS = 30000;
	private chromeOptions = new chrome.Options();
	private chromeCapabilities = Capabilities.chrome();
	private selenoidOptionsCapabilities = {}
	private driverMap: Map<string, {driver: WebDriver, sessionName: string, connectionRole: OpenViduRole}> = new Map();
	private readonly CHROME_BROWSER_IMAGE = 'aerokube/selenoid:latest-release';
	private readonly RECORDINGS_PATH = '/opt/selenoid/video';
	private readonly QOE_RECORDINGS_PATH = '/home/ubuntu/qoe';
	private readonly MEDIA_FILES_PATH = '/home/ubuntu/mediafiles';
	private readonly VIDEO_FILE_LOCATION = '/home/ubuntu/mediafiles/fakevideo';
	private readonly AUDIO_FILE_LOCATION = '/home/ubuntu/mediafiles/fakeaudio.wav';
	private keepAliveIntervals = new Map();
	private totalPublishers: number = 0;

	constructor(private dockerService: DockerService = new DockerService(), private errorGenerator: ErrorGenerator = new ErrorGenerator()) {
		this.chromeOptions.addArguments(
			'--disable-dev-shm-usage',
			'--use-fake-ui-for-media-stream',
			'--start-maximized',
			'--use-fake-device-for-media-stream',
			'--allow-file-access-from-files',
			`--use-file-for-fake-audio-capture=${this.AUDIO_FILE_LOCATION}`
		);
		// TODO: Check audio processing for use-file-for-fake-audio-capture
		// https://peter.sh/experiments/chromium-command-line-switches/#use-file-for-fake-audio-capture
		// https://stackoverflow.com/questions/29936416/webrtc-disable-all-audio-processing
		const prefs = new logging.Preferences();
		prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);
		this.chromeCapabilities.setLoggingPrefs(prefs);
		this.chromeCapabilities.setAcceptInsecureCerts(true);
		if (process.env.IS_DOCKER_CONTAINER === 'true') {
			this.chromeOptions.addArguments(`--unsafely-treat-insecure-origin-as-secure=http://${DOCKER_NAME}`);
		}
	}

	public async startSelenoid(): Promise<void> {
		const configPath = `${process.env.PWD}/config/browsers.json`;
		const configFile = fs.readFileSync(configPath, "utf8");
		const configJson = JSON.parse(configFile);
		configJson["chrome"]["versions"]["108.0"]["volumes"] = [`${process.env.PWD}/src/assets/mediafiles:${this.MEDIA_FILES_PATH}`];
		fs.writeFileSync(configPath, JSON.stringify(configJson, null, 4), "utf8");
		const containerName = `selenoid`;
		const bindedPort = this.BROWSER_CONTAINER_HOSTPORT;
		const options: ContainerCreateOptions = this.getChromeContainerOptions(containerName, bindedPort);
		const container = await this.dockerService.getContainerByIdOrName(containerName);
		if (!!container) {
			console.log("Selenoid container already up")
			return Promise.resolve();
		};
		try {
			console.log("Selenoid container starting")
			await this.dockerService.startContainer(options);
			console.log("Selenoid container started")
			// TODO: better wait for selenoid (curl http://localhost:4444/status)
			// await new Promise(resolve => setTimeout(resolve, 1000));
		} catch (error) {
			if (error.statusCode === 409) {
				console.log("Selenoid container already up")
				return Promise.resolve();
			}
			console.error(error);
			return Promise.reject(new Error(error));
		}
	}

	async deleteStreamManagerWithConnectionId(containerId: string): Promise<void> {
		console.log('Removing and stopping container ', containerId);
		const value = this.driverMap.get(containerId);
		const keepAliveInterval = this.keepAliveIntervals.get(containerId);
		if (!!keepAliveInterval) {
			clearInterval(keepAliveInterval);
			this.keepAliveIntervals.delete(containerId);
		}
		await this.saveQoERecordings(containerId);
		await value.driver.quit();
		this.driverMap.delete(containerId);
		this.deleteConnection(value.sessionName, containerId, value.connectionRole);
	}

	async deleteStreamManagerWithRole(role: OpenViduRole): Promise<void> {
		const containersToDelete = [];
		const promisesToResolve: Promise<void>[] = [];
		const recordingPromises: Promise<void>[] = [];
		this.driverMap.forEach((value, key) => {
			if (value.connectionRole === role) {
				containersToDelete.push({key, value});
				recordingPromises.push(this.saveQoERecordings(key));
				this.deleteConnection(value.sessionName, key, value.connectionRole);
			}
		});
		await Promise.all(recordingPromises);
		containersToDelete.forEach((item) => {
			const keepAliveInterval = this.keepAliveIntervals.get(item.key);
			if (!!keepAliveInterval) {
				clearInterval(keepAliveInterval);
				this.keepAliveIntervals.delete(item.key);
			}
			promisesToResolve.push(item.value.driver.quit());
			this.driverMap.delete(item.key);
		});
		await Promise.all(promisesToResolve);
	}

	async clean(): Promise<void> {
		await Promise.all([this.deleteStreamManagerWithRole(OpenViduRole.PUBLISHER), this.deleteStreamManagerWithRole(OpenViduRole.SUBSCRIBER)]);
	}

	async launchBrowser(
		request: LoadTestPostRequest,
		storageNameObj?: StorageNameObject,
		storageValueObj?: StorageValueObject,
		timeout: number = 1000
	): Promise<string> {
		const properties = request.properties;
		if (!this.existMediaFiles(properties.resolution, properties.frameRate) && !process.env.IS_DOCKER_CONTAINER) {
			return Promise.reject({
				message: 'WARNING! Media files not found. fakevideo.y4m and fakeaudio.wav. Have you run downloaded the mediafiles?',
			});
		}
		const isRecording = !!properties.recording && !properties.headless;
		if (isRecording) {
			this.selenoidOptionsCapabilities["enableVideo"] = true;
			await this.dockerService.pullImage("selenoid/video-recorder:latest-release");
		}
		this.selenoidOptionsCapabilities["enableVNC"] = true;
		this.selenoidOptionsCapabilities["enableLog"] = true;
		this.selenoidOptionsCapabilities["sessionTimeout"] = "24h";
		// https://aerokube.com/selenoid/latest/#_specifying_capabilities_via_protocol_extensions
		this.chromeCapabilities.set("selenoid:options", this.selenoidOptionsCapabilities);
		if (!!properties.headless) {
			this.chromeOptions.addArguments('--headless');
		}
		// Set video file path based on resolution property
		// Resolution is not significant for audio
		this.chromeOptions.addArguments(`--use-file-for-fake-video-capture=${this.VIDEO_FILE_LOCATION}_${properties.frameRate}fps_${properties.resolution}.y4m`);
		return new Promise((resolve, reject) => {
			setTimeout(async () => {
				let driverId: string;
				try {
					const webappUrl = this.generateWebappUrl(request.token, request.properties);
					console.log(webappUrl);
					let chrome = await this.getChromeDriver(this.BROWSER_CONTAINER_HOSTPORT);
					driverId = (await chrome.getSession()).getId();
					this.driverMap.set(driverId, {driver: chrome, sessionName: properties.sessionName, connectionRole: properties.role});
					await chrome.get(webappUrl);

					if (!!storageNameObj && !!storageValueObj) {
						// Add webrtc stats config to LocalStorage
						await chrome.executeScript(
							() => {
								localStorage.setItem(arguments[0].webrtcStorageName, arguments[1].webrtcStorageValue);
								localStorage.setItem(arguments[0].ovEventStorageName, arguments[1].ovEventStorageValue);
								localStorage.setItem(arguments[0].qoeStorageName, arguments[1].qoeStorageValue);
							},
							storageNameObj,
							storageValueObj
						);
					}

					// Wait until connection has been created
					await chrome.wait(until.elementsLocated(By.id('local-connection-created')), this.BROWSER_WAIT_TIMEOUT_MS);
					let currentPublishers = 0;
					if (request.properties.role === OpenViduRole.PUBLISHER) {
						// Wait until publisher has been published regardless of whether the videos are shown or not
						await chrome.wait(until.elementsLocated(By.id('local-stream-created')), this.BROWSER_WAIT_TIMEOUT_MS);
						currentPublishers++;
					} else {
						// As subscribers are created muted because of user gesture policies, we need to unmute subscriber manually
						await chrome.wait(until.elementsLocated(By.id('subscriber-need-to-be-unmuted')), this.BROWSER_WAIT_TIMEOUT_MS);
						await chrome.sleep(1000);
						const buttons = await chrome.findElements(By.id('subscriber-need-to-be-unmuted'));
						buttons.forEach(button => button.click());
					}
					console.log('Browser works as expected');
					const publisherVideos = await chrome.findElements(By.css("[id^=\"remote-video-str\"]"))
					this.totalPublishers = currentPublishers + publisherVideos.length;
					// Workaround, currently browsers timeout after 1h unless we send an HTTP request to Selenium
					// set interval each minute to send a request to Selenium
					// Maybe this is unnecessary now that we are using selenoid
					const keepAliveInterval = setInterval(() => {
						chrome.executeScript(() => {
							return true;
						});
					}, 60000);
					this.keepAliveIntervals.set(driverId, keepAliveInterval);
					resolve(driverId);
				} catch (error) {
					console.log(error);
					if (!!driverId) {
						await this.printBrowserLogs(driverId);
					}
					reject(this.errorGenerator.generateError(error));
				}
			}, timeout);
		});
	}

	getStreamsCreated(): number {
		let result = 0;
		this.connections.forEach((value: { publishers: string[]; subscribers: string[] }, key: string) => {
			let streamsSent = value.publishers.length;
			let streamsReceived = 0;
			const publishersInWorker = value.publishers.length;
			let externalPublishers = this.totalPublishers - publishersInWorker;
			if (externalPublishers < 0) {
				externalPublishers = 0;
			}
			// Add all streams subscribed by publishers
			streamsReceived = publishersInWorker * externalPublishers + publishersInWorker * (publishersInWorker - 1);

			streamsReceived += value.subscribers.length * this.totalPublishers;
			result += streamsSent + streamsReceived;
		});

		return result;
	}

	getParticipantsCreated(): number {
		return this.driverMap.size;
	}

	storeConnection(connectionId: string, properties: TestProperties) {
		if (this.connections.has(properties.sessionName)) {
			if (properties.role === OpenViduRole.PUBLISHER) {
				this.connections.get(properties.sessionName).publishers.push(connectionId);
			} else {
				this.connections.get(properties.sessionName).subscribers.push(connectionId);
			}
		} else {
			const subscribers = [];
			const publishers = [];
			if (properties.role === OpenViduRole.PUBLISHER) {
				publishers.push(connectionId);
			} else {
				subscribers.push(connectionId);
			}
			this.connections.set(properties.sessionName, { publishers, subscribers });
		}
	}

	private deleteConnection(sessionName: string, connectionId: string, role: OpenViduRole) {
		const value = this.connections.get(sessionName);
		if (!!value) {
			let index = -1;
			if (role === OpenViduRole.PUBLISHER) {
				index = value.publishers.indexOf(connectionId, 0);
				if (index >= 0) {
					value.publishers.splice(index, 1);
				}
			} else {
				index = value.subscribers.indexOf(connectionId, 0);
				if (index >= 0) {
					value.subscribers.splice(index, 1);
				}
			}
		}
	}

	private getChromeContainerOptions(containerName: string, hostPort: number): ContainerCreateOptions {
		const numOfCpus = (2*os.cpus().length).toString();
		const options: ContainerCreateOptions = {
			Image: this.CHROME_BROWSER_IMAGE,
			name: containerName,
			ExposedPorts: {
				'4444/tcp': {},
				// VNC service password for 'elastestbrowsers/chrome' image is 'selenoid'
				// '6080/tcp': {},
				// '5900/tcp': {},
			},
			Env: [`OVERRIDE_VIDEO_OUTPUT_DIR=${process.env.PWD}/recordings/chrome`],
			HostConfig: {
				Binds: [
					`${process.env.PWD}/recordings/chrome:${this.RECORDINGS_PATH}`,
					`${process.env.PWD}/recordings/qoe:${this.QOE_RECORDINGS_PATH}`,
					`${process.env.PWD}/src/assets/mediafiles:${this.MEDIA_FILES_PATH}`,
					`${process.env.PWD}/config/:/etc/selenoid/:ro`,
					`${process.env.PWD}/selenoid-logs/:/opt/selenoid/logs/`,
					"/var/run/docker.sock:/var/run/docker.sock"
				],
				PortBindings: {
					'4444/tcp': [{ HostPort: hostPort.toString(), HostIp: '0.0.0.0' }],
					// '6080/tcp': [{ HostPort: (hostPort + 2000).toString(), HostIp: '0.0.0.0' }],
					// '5900/tcp': [{ HostPort: (hostPort + 1900).toString(), HostIp: '0.0.0.0' }],
				},
				NetworkMode: "browseremulator"
				//CapAdd: ['SYS_ADMIN'],
			},
			Cmd: ["-limit", numOfCpus, "-timeout", "24h", "-container-network", "browseremulator"] // Timeout might be overkill
		};
		return options;
	}

	private async getChromeDriver(bindedPort: number): Promise<WebDriver> {
		return await new Builder()
			.forBrowser(Browser.CHROME)
			.withCapabilities(this.chromeCapabilities)
			.setChromeOptions(this.chromeOptions)
			.usingServer(`http://selenoid:${bindedPort}/wd/hub`)
			.build();
	}

	private generateWebappUrl(token: string, properties: TestProperties): string {
		const publicUrl = !!process.env.OPENVIDU_URL ? `publicurl=${process.env.OPENVIDU_URL}&` : '';
		const secret = !!process.env.OPENVIDU_SECRET ? `secret=${process.env.OPENVIDU_SECRET}&` : '';
		const recordingMode = !!properties.recordingOutputMode ? `recordingmode=${properties.recordingOutputMode}&` : '';
		const tokenParam = !!token ? `token=${token}` : '';
		const qoeAnalysis = !!process.env.QOE_ANALYSIS;
		return (
			`https://${process.env.LOCATION_HOSTNAME}/?` +
			publicUrl +
			secret +
			recordingMode +
			tokenParam +
			`role=${properties.role}&` +
			`sessionId=${properties.sessionName}&` +
			`userId=${properties.userId}&` +
			`audio=${properties.audio}&` +
			`video=${properties.video}&` +
			`resolution=${properties.resolution}&` +
			`showVideoElements=${properties.showVideoElements}&` +
			`frameRate=${properties.frameRate}&` +
			`qoeAnalysis=${qoeAnalysis}`
		);
	}

	private existMediaFiles(resolution: string, framerate: number): boolean {
		const videoFile = `${process.env.PWD}/src/assets/mediafiles/fakevideo_${framerate}fps_${resolution}.y4m`;
		const audioFile = `${process.env.PWD}/src/assets/mediafiles/fakeaudio.wav`;
		try {
			return fs.existsSync(videoFile) && fs.existsSync(audioFile);
		} catch (error) {
			return false;
		}
	}

	private async saveQoERecordings(containerId: string) {
		if (!!process.env.QOE_ANALYSIS) {
			console.log("Saving QoE Recordings for container " + containerId);
			const chrome = this.driverMap.get(containerId).driver;
			if (!!chrome) {
				console.log("Executing getRecordings for container " + containerId);
				const fileNamePrefix = `QOE`;
				try {
					await chrome.executeAsyncScript(`
						const callback = arguments[arguments.length - 1];
						try {
							await getRecordings('${fileNamePrefix}');
							callback();
						} catch (error) {
							console.error(error);
							throw new Error(error);
						}
					`);
					console.log("QoE Recordings saved for container " + containerId);
					await this.printBrowserLogs(containerId);
				} catch (error) {
					console.log("Error saving QoE Recordings for container " + containerId);
					console.log(error);
					await this.printBrowserLogs(containerId);
				}
				this.driverMap.delete(containerId);
			}
		}
	}

	private async printBrowserLogs(driverId: string) {
		const entries = await this.driverMap.get(driverId).driver.manage().logs().get(logging.Type.BROWSER)
		if (!!entries) {
			function formatTime(s: number): string {
				const dtFormat = new Intl.DateTimeFormat('en-GB', {
					timeStyle: 'medium',
					timeZone: 'UTC'
				});

				return dtFormat.format(new Date(s * 1e3));
			}

			entries.forEach(function (entry) {
				console.log('%s - [%s] %s', formatTime(entry.timestamp), entry.level.name, entry.message);
			});
		}
	}
}
