import fs = require('fs');
import { By, Capabilities, until, WebDriver, logging, Browser } from 'selenium-webdriver';
import chrome = require('selenium-webdriver/chrome');
import firefox = require('selenium-webdriver/firefox');
import { LoadTestPostRequest, TestProperties } from '../types/api-rest.type';
import { OpenViduRole } from '../types/openvidu.type';
import { ErrorGenerator } from '../utils/error-generator';
import { Storage } from './local-storage.service';
import { StorageNameObject, StorageValueObject } from '../types/storage-config.type';
import { APPLICATION_MODE, DOCKER_NAME } from '../config';
import { SeleniumService } from './selenium.service';
import { runScript, stopDetached } from '../utils/run-script';
import { ApplicationMode } from '../types/config.type';
import BaseComModule from '../com-modules/base';
declare var localStorage: Storage;
export class RealBrowserService {
	private connections: Map<string, { publishers: string[]; subscribers: string[] }> = new Map();

	private readonly BROWSER_WAIT_TIMEOUT_MS = 30000;
	private chromeOptions = new chrome.Options();
	private chromeCapabilities = Capabilities.chrome();
	private firefoxOptions = new firefox.Options();
	private firefoxCapabilities = Capabilities.firefox();
	private driverMap: Map<string, {driver: WebDriver, sessionName: string, userName: string, connectionRole: OpenViduRole}> = new Map();
	private readonly VIDEO_FILE_LOCATION = `${process.cwd()}/src/assets/mediafiles/fakevideo`;
	private readonly AUDIO_FILE_LOCATION = `${process.cwd()}/src/assets/mediafiles/fakeaudio.wav`;
	private keepAliveIntervals = new Map();
	private totalPublishers: number = 0;
	private seleniumService: SeleniumService;
	private recordingScript: any;
	private seleniumLogger: logging.Logger;

	constructor(private errorGenerator: ErrorGenerator = new ErrorGenerator()) {
		const prefs = new logging.Preferences();
		this.seleniumLogger = logging.getLogger('webdriver');
		prefs.setLevel(logging.Type.BROWSER, logging.Level.INFO);
		prefs.setLevel(logging.Type.DRIVER, logging.Level.INFO);
		prefs.setLevel(logging.Type.CLIENT, logging.Level.INFO);
		prefs.setLevel(logging.Type.PERFORMANCE, logging.Level.INFO);
		prefs.setLevel(logging.Type.SERVER, logging.Level.INFO);
		logging.installConsoleHandler();
		if (process.env.REAL_DRIVER === "firefox") {
			this.firefoxCapabilities.setLoggingPrefs(prefs);
			this.firefoxCapabilities.setAcceptInsecureCerts(true);
			this.firefoxOptions
				.setPreference("permissions.default.microphone", 1)
				.setPreference("permissions.default.camera", 1)
				.setPreference("devtools.console.stdout.content", true);
		} else {
			this.chromeCapabilities.setLoggingPrefs(prefs);
			this.chromeCapabilities.setAcceptInsecureCerts(true);
			this.chromeOptions.addArguments(
				'--disable-dev-shm-usage',
				'--use-fake-ui-for-media-stream',
				"--no-sandbox",
				"--disable-gpu"
			);
		}
		if (process.env.IS_DOCKER_CONTAINER === 'true') {
			this.chromeOptions.addArguments(`--unsafely-treat-insecure-origin-as-secure=http://${DOCKER_NAME}`);
		}
	}

	public async startSelenium(properties: TestProperties): Promise<void> {
		const videoPath = `${this.VIDEO_FILE_LOCATION}_${properties.frameRate}fps_${properties.resolution}.y4m`
		this.seleniumService = await SeleniumService.getInstance(videoPath, this.AUDIO_FILE_LOCATION);
	}

	async deleteStreamManagerWithConnectionId(driverId: string): Promise<void> {
		console.log('Removing and stopping driver ', driverId);
		const value = this.driverMap.get(driverId);
		const keepAliveInterval = this.keepAliveIntervals.get(driverId);
		if (!!keepAliveInterval) {
			clearInterval(keepAliveInterval);
			this.keepAliveIntervals.delete(driverId);
		}
		await this.saveQoERecordings(driverId);
		await value.driver.quit();
		this.driverMap.delete(driverId);
		this.deleteConnection(value.sessionName, driverId, value.connectionRole);
	}


	async deleteStreamManagerWithSessionAndUser(sessionId: string, userId: string) {
		// find entry in driverMap
		const driversToDelete: {key: string, value: {
			driver: WebDriver;
			sessionName: string;
			userName: string;
			connectionRole: OpenViduRole;
		} }[] = [];
		const promisesToResolve: Promise<void>[] = [];
		const recordingPromises: Promise<void>[] = [];
		this.driverMap.forEach((value, key) => {
			if (value.sessionName === sessionId && value.userName === userId) {
				driversToDelete.push({key, value});
				recordingPromises.push(this.saveQoERecordings(key));
				this.deleteConnection(sessionId, key, value.connectionRole)
			}
		});
		if (recordingPromises.length > 0) {
			await Promise.all(recordingPromises)
		}
		driversToDelete.forEach((item) => {
			const keepAliveInterval = this.keepAliveIntervals.get(item.key);
			if (!!keepAliveInterval) {
				clearInterval(keepAliveInterval);
				this.keepAliveIntervals.delete(item.key);
			}
			promisesToResolve.push(this.quitDriver(item.key, item.value));
			this.driverMap.delete(item.key);
		});
		try {
			await Promise.all(promisesToResolve);
		} catch (error) {
			console.error('Error quitting driver ', error);
		}
	}

	async deleteStreamManagerWithRole(role: OpenViduRole): Promise<void> {
		console.log("Current number of total users in worker: " + this.driverMap.size);
		console.log("Deleting all " + role.toString());
		const driversToDelete: {key: string, value: {
			driver: WebDriver;
			sessionName: string;
			connectionRole: OpenViduRole;
		} }[] = [];
		const promisesToResolve: Promise<void>[] = [];
		const recordingPromises: Promise<void>[] = [];
		this.driverMap.forEach((value, key) => {
			if (value.connectionRole === role) {
				driversToDelete.push({key, value});
				console.log("Driver to delete: " + key + " with session: " + value.sessionName)

				recordingPromises.push(this.saveQoERecordings(key));
				this.deleteConnection(value.sessionName, key, value.connectionRole)
			}
		});
		console.log("Number of users to delete: " + driversToDelete.length)
		if (recordingPromises.length > 0) {
			console.log("Number of QoE recordings to save: " + recordingPromises.length)
			await Promise.all(recordingPromises)
			console.log("QoE recordings saved")
		}
		console.log("Clearing keep alive intervals")
		driversToDelete.forEach((item) => {
			const keepAliveInterval = this.keepAliveIntervals.get(item.key);
			if (!!keepAliveInterval) {
				clearInterval(keepAliveInterval);
				this.keepAliveIntervals.delete(item.key);
			}
			promisesToResolve.push(this.quitDriver(item.key, item.value));
			this.driverMap.delete(item.key);
		});
		try {
			await Promise.all(promisesToResolve);
		} catch (error) {
			console.error('Error quitting driver ', error);
		}
	}

	private async quitDriver(key: string, value: {
		driver: WebDriver;
		sessionName: string;
		connectionRole: OpenViduRole;
	}) {
		console.log("Quitting driver: " + key + " with session: " + value.sessionName)
		try {
			await value.driver.quit()
			console.log("Driver quit: " + key + " with session: " + value.sessionName + " successfully")
		} catch (error) {
			console.error("Error quitting driver: " + key + " with session: " + value.sessionName, error)
		}
	}

	async clean(): Promise<void> {
		console.log("Cleaning real browsers")
		this.stopRecording();
		await Promise.all([this.deleteStreamManagerWithRole(OpenViduRole.PUBLISHER), this.deleteStreamManagerWithRole(OpenViduRole.SUBSCRIBER)]);
		console.log("Real browsers cleaned")
	}

	stopRecording() {
		if (!!this.recordingScript) {
			console.log("Stopping general recording")
			stopDetached(this.recordingScript.pid);
		}
	}

	async launchBrowser(
		request: LoadTestPostRequest,
		storageNameObj?: StorageNameObject,
		storageValueObj?: StorageValueObject,
		timeout: number = 1000
	): Promise<string> {
		const properties = request.properties;
		if (!this.existMediaFiles(properties.resolution, properties.frameRate) && !process.env.IS_DOCKER_CONTAINER && (APPLICATION_MODE === ApplicationMode.PROD)) {
			return Promise.reject({
				message: 'WARNING! Media files not found. fakevideo.y4m and fakeaudio.wav. Have you run downloaded the mediafiles?',
			});
		}
		if (!!properties.headless) {
			this.chromeOptions.addArguments('--headless');
			this.firefoxOptions.headless();
		}
		return new Promise((resolve, reject) => {
			setTimeout(async () => {
				let driverId: string;
				try {
					const comModuleInstance = BaseComModule.getInstance();
					const webappUrl = comModuleInstance.generateWebappUrl(request);
					console.log(webappUrl);
					let driver: WebDriver; 
					if (process.env.REAL_DRIVER === "firefox") {
						driver = await this.seleniumService.getFirefoxDriver(this.firefoxCapabilities, this.firefoxOptions);
					} else {
						driver = await this.seleniumService.getChromeDriver(this.chromeCapabilities, this.chromeOptions);
					}
					driverId = (await driver.getSession()).getId();
					this.driverMap.set(driverId, {driver, sessionName: properties.sessionName, userName: properties.userId,connectionRole: properties.role});
					await driver.manage().setTimeouts({script: 1800000});
					await driver.get(webappUrl);

					if (!!storageNameObj && !!storageValueObj) {
						// Add webrtc stats config to LocalStorage
						// TODO: Possible race condition where openvidu-browser runs before the localStorage is updated so it doesn't record webrtc stats
						await driver.executeScript(
							() => {
								localStorage.setItem(arguments[0].webrtcStorageName, arguments[1].webrtcStorageValue);
								localStorage.setItem(arguments[0].ovEventStorageName, arguments[1].ovEventStorageValue);
								localStorage.setItem(arguments[0].qoeStorageName, arguments[1].qoeStorageValue);
								localStorage.setItem(arguments[0].errorStorageName, arguments[1].errorStorageValue);
							},
							storageNameObj,
							storageValueObj
						);
					}
					
					await driver.manage().window().maximize();

					const isRecording = !!properties.recording && !properties.headless;
					if (isRecording && !this.recordingScript) {
						const ffmpegCommand = [
							"ffmpeg -hide_banner -loglevel warning -nostdin -y",
							` -video_size 1920x1080 -framerate ${properties.frameRate} -f x11grab -i :10`,
							` -f pulse -i 0 `,
							`${process.cwd()}/recordings/chrome/session_${Date.now()}.mp4`,
						].join("");
						this.recordingScript = await runScript(ffmpegCommand, {
							detached: true
						})
					}
					// Wait until connection has been created
					await driver.wait(until.elementsLocated(By.id('local-connection-created')), this.BROWSER_WAIT_TIMEOUT_MS);
					let currentPublishers = 0;
					if (request.properties.role === OpenViduRole.PUBLISHER) {
						// Wait until publisher has been published regardless of whether the videos are shown or not
						await driver.wait(until.elementsLocated(By.id('local-stream-created')), this.BROWSER_WAIT_TIMEOUT_MS);
						currentPublishers++;
					}
					// As subscribers are created muted because of user gesture policies, we need to unmute subscriber manually
					// await driver.wait(until.elementsLocated(By.id('subscriber-need-to-be-unmuted')), this.BROWSER_WAIT_TIMEOUT_MS);
					await driver.sleep(1000);
					for (const driverObj of this.driverMap.values()) {
						const driver = driverObj.driver;
						const buttons = await driver.findElements(By.id('subscriber-need-to-be-unmuted'));
						buttons.forEach(button => button.click());
					}
					console.log('Browser works as expected');
					const publisherVideos = await driver.findElements(By.css("[id^=\"remote-video-str\"]"))
					this.totalPublishers = currentPublishers + publisherVideos.length;
					// Workaround, currently browsers timeout after 1h unless we send an HTTP request to Selenium
					// set interval each minute to send a request to Selenium
					const keepAliveInterval = setInterval(() => {
						driver.executeScript(() => {
							return true;
						});
					}, 60000);
					this.keepAliveIntervals.set(driverId, keepAliveInterval);
					resolve(driverId);
				} catch (error) {
					console.log(error);
					if (!!driverId) {
						const driver = this.driverMap.get(driverId);
						if (driver) {
							await this.printBrowserLogs(driverId);
							await this.deleteStreamManagerWithConnectionId(driverId);
							reject(this.errorGenerator.generateError(error));
						} else {
							console.log("Driver already quit.");
						}
					}
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

	private existMediaFiles(resolution: string, framerate: number): boolean {
		const videoFile = `${process.cwd()}/src/assets/mediafiles/fakevideo_${framerate}fps_${resolution}.y4m`;
		const audioFile = `${process.cwd()}/src/assets/mediafiles/fakeaudio.wav`;
		try {
			return fs.existsSync(videoFile) && fs.existsSync(audioFile);
		} catch (error) {
			return false;
		}
	}

	private async saveQoERecordings(driverId: string) {
		if (!!process.env.QOE_ANALYSIS && !!driverId) {
			console.log("Saving QoE Recordings for driver " + driverId);
			const driver = this.driverMap.get(driverId).driver;
			if (!!driver) {
				console.log("Executing getRecordings for driver " + driverId);
				try {
					await driver.executeAsyncScript(`
						const callback = arguments[arguments.length - 1];
						try {
							recordingManager.getRecordings()
							.catch(error => {
								console.error(error)
							}).finally(() => {
								try {
									leaveSession();
								} catch (error) {
									console.error("Can't disconnect from session")
									console.error(error)
								}
								callback()
							});
						} catch (error) {
							console.error(error)
							callback()
						}
					`);
					console.log("QoE Recordings saved for driver " + driverId);
					await this.printBrowserLogs(driverId);
				} catch (error) {
					console.log("Error saving QoE Recordings for driver " + driverId);
					console.log(error);
					await this.printBrowserLogs(driverId);
				}
				this.driverMap.delete(driverId);
			}
		}
	}

	private async printBrowserLogs(driverId: string) {
		if (process.env.REAL_DRIVER !== "firefox") {
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
}
