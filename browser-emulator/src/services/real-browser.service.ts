import fsPromises from 'node:fs/promises';
import { By, logging, until, WebDriver } from 'selenium-webdriver';
import type { Storage } from './local-storage.service.js';
import type {
	StorageNameObject,
	StorageValueObject,
} from '../types/storage-config.type.js';
import type { ConfigService } from './config.service.js';
import { SeleniumService } from './selenium.service.js';
import { Mutex } from 'async-mutex';
import type { ChildProcess } from 'node:child_process';
import type BaseComModule from '../com-modules/base.ts';
import type { ScriptRunnerService } from './script-runner.service.ts';
import { LocalFilesRepository } from '../repositories/files/local-files.repository.ts';
import {
	type AvailableBrowsers,
	type CreateUserBrowser,
	type UserJoinProperties,
	Role,
} from '../types/create-user.type.ts';

declare let localStorage: Storage;
export class RealBrowserService {
	private readonly connections = new Map<
		string,
		{ publishers: string[]; subscribers: string[] }
	>();

	private readonly BROWSER_WAIT_TIMEOUT_MS = 30000;
	private readonly driverMap = new Map<
		string,
		{
			driver: WebDriver;
			sessionName: string;
			userName: string;
			connectionRole: Role;
			browser: AvailableBrowsers;
			mediaRecorders: boolean;
		}
	>();
	private readonly keepAliveIntervals = new Map<string, NodeJS.Timeout>();
	private totalPublishers = 0;
	private recordingScript: ChildProcess | undefined;
	private isRecordingFullScreen = false;
	private readonly muteButtonMutex = new Mutex();
	private readonly configService: ConfigService;
	private readonly seleniumService: SeleniumService;
	private readonly scriptRunnerService: ScriptRunnerService;
	private readonly localFilesRepository: LocalFilesRepository;
	private readonly comModule: BaseComModule;

	constructor(
		configService: ConfigService,
		seleniumService: SeleniumService,
		comModule: BaseComModule,
		scriptRunnerService: ScriptRunnerService,
		localFilesRepository: LocalFilesRepository,
	) {
		this.configService = configService;
		this.seleniumService = seleniumService;
		this.comModule = comModule;
		this.scriptRunnerService = scriptRunnerService;
		this.localFilesRepository = localFilesRepository;
	}

	async deleteStreamManagerWithConnectionId(driverId: string): Promise<void> {
		console.log('Removing and stopping driver ', driverId);
		const value = this.driverMap.get(driverId);
		const keepAliveInterval = this.keepAliveIntervals.get(driverId);
		if (keepAliveInterval) {
			clearInterval(keepAliveInterval);
			this.keepAliveIntervals.delete(driverId);
		}
		if (value) {
			await this.saveQoERecordings(driverId);
			await value.driver.quit();
			this.driverMap.delete(driverId);
			this.deleteConnection(
				value.sessionName,
				driverId,
				value.connectionRole,
			);
		}
	}

	async deleteStreamManagerWithSessionAndUser(
		sessionId: string,
		userId: string,
	) {
		// find entry in driverMap
		const driversToDelete: {
			key: string;
			value: {
				driver: WebDriver;
				sessionName: string;
				userName: string;
				connectionRole: Role;
			};
		}[] = [];
		const promisesToResolve: Promise<void>[] = [];
		const recordingPromises: Promise<void>[] = [];
		this.driverMap.forEach((value, key) => {
			if (value.sessionName === sessionId && value.userName === userId) {
				driversToDelete.push({ key, value });
				recordingPromises.push(this.saveQoERecordings(key));
				this.deleteConnection(sessionId, key, value.connectionRole);
			}
		});
		if (recordingPromises.length > 0) {
			await Promise.all(recordingPromises);
		}
		driversToDelete.forEach(item => {
			const keepAliveInterval = this.keepAliveIntervals.get(item.key);
			if (keepAliveInterval) {
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

	async deleteStreamManagerWithRole(role: Role): Promise<void> {
		console.log(
			'Current number of total users in worker: ' + this.driverMap.size,
		);
		console.log('Deleting all ' + role.toString());
		const driversToDelete: {
			key: string;
			value: {
				driver: WebDriver;
				sessionName: string;
				connectionRole: Role;
			};
		}[] = [];
		const promisesToResolve: Promise<void>[] = [];
		const recordingPromises: Promise<void>[] = [];
		this.driverMap.forEach((value, key) => {
			if (value.connectionRole === role) {
				driversToDelete.push({ key, value });
				console.log(
					'Driver to delete: ' +
						key +
						' with session: ' +
						value.sessionName,
				);

				recordingPromises.push(this.saveQoERecordings(key));
				this.deleteConnection(
					value.sessionName,
					key,
					value.connectionRole,
				);
			}
		});
		console.log('Number of users to delete: ' + driversToDelete.length);
		if (recordingPromises.length > 0) {
			console.log(
				'Number of QoE recordings to save: ' + recordingPromises.length,
			);
			await Promise.all(recordingPromises);
			console.log('QoE recordings saved');
		}
		console.log('Clearing keep alive intervals');
		driversToDelete.forEach(item => {
			const keepAliveInterval = this.keepAliveIntervals.get(item.key);
			if (keepAliveInterval) {
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

	private async quitDriver(
		key: string,
		value: {
			driver: WebDriver;
			sessionName: string;
			connectionRole: Role;
		},
	) {
		console.log(
			'Quitting driver: ' + key + ' with session: ' + value.sessionName,
		);
		try {
			await value.driver.quit();
			console.log(
				'Driver quit: ' +
					key +
					' with session: ' +
					value.sessionName +
					' successfully',
			);
		} catch (error) {
			console.error(
				'Error quitting driver: ' +
					key +
					' with session: ' +
					value.sessionName,
				error,
			);
		}
	}

	async clean(): Promise<void> {
		console.log('Cleaning real browsers');
		await this.stopRecording();
		await Promise.all([
			this.deleteStreamManagerWithRole(Role.PUBLISHER),
			this.deleteStreamManagerWithRole(Role.SUBSCRIBER),
		]);
		console.log('Real browsers cleaned');
	}

	async stopRecording() {
		if (this.recordingScript) {
			console.log('Stopping general recording');
			await this.scriptRunnerService.killDetached(this.recordingScript);
		}
	}

	async launchBrowser(
		request: CreateUserBrowser,
		storageNameObj?: StorageNameObject,
		storageValueObj?: StorageValueObject,
		timeout = 1000,
	): Promise<string> {
		const properties = request.properties;
		const filesExist = await this.localFilesRepository.existMediaFiles();
		if (!filesExist) {
			throw new Error(
				'WARNING! Media files not found. Have you run downloaded the mediafiles?',
			);
		}
		if (properties.headless) {
			this.seleniumService.setHeadless();
		}
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				this.initializeBrowser(
					request,
					this.seleniumService,
					storageNameObj,
					storageValueObj,
				)
					.then(driverId => resolve(driverId))
					.catch(error =>
						reject(
							error instanceof Error
								? error
								: new Error(String(error)),
						),
					);
			}, timeout);
		});
	}

	private async initializeBrowser(
		request: CreateUserBrowser,
		seleniumService: SeleniumService,
		storageNameObj?: StorageNameObject,
		storageValueObj?: StorageValueObject,
	): Promise<string> {
		let driverId: string | undefined;
		try {
			const webappUrl = this.comModule.generateWebappUrl(request);
			console.log(webappUrl);
			const driver = await seleniumService.getDriver(
				request.properties.browser,
				request.properties.sessionName +
					'_' +
					request.properties.userId,
			);
			driverId = (await driver.getSession()).getId();
			this.driverMap.set(driverId, {
				driver,
				sessionName: request.properties.sessionName,
				userName: request.properties.userId,
				connectionRole: request.properties.role,
				browser: request.properties.browser,
				mediaRecorders: request.properties.mediaRecorders ?? false,
			});
			await driver.manage().setTimeouts({ script: 1800000 });
			await driver.get(webappUrl);

			if (!!storageNameObj && !!storageValueObj) {
				await this.setLocalStorageConfig(
					driver,
					storageNameObj,
					storageValueObj,
				);
			}

			await this.setupBrowserWindow(driver, request.properties);
			await this.waitForConnection(driver, request);
			this.setupKeepAlive(driver, driverId);
			return driverId;
		} catch (error) {
			console.log(error);
			if (driverId) {
				await this.handleBrowserError(driverId);
			}
			throw error;
		}
	}

	private async setLocalStorageConfig(
		driver: WebDriver,
		storageNameObj: StorageNameObject,
		storageValueObj: StorageValueObject,
	): Promise<void> {
		// Add webrtc stats config to LocalStorage
		await driver.executeScript(
			(names: StorageNameObject, values: StorageValueObject) => {
				localStorage.setItem(
					names.webrtcStorageName,
					values.webrtcStorageValue,
				);
				localStorage.setItem(
					names.ovEventStorageName,
					values.ovEventStorageValue,
				);
				localStorage.setItem(
					names.qoeStorageName,
					values.qoeStorageValue,
				);
				localStorage.setItem(
					names.errorStorageName,
					values.errorStorageValue,
				);
			},
			storageNameObj,
			storageValueObj,
		);
	}

	private async setupBrowserWindow(
		driver: WebDriver,
		properties: UserJoinProperties,
	): Promise<void> {
		// Unlike chrome, firefox is maximized this way here because of this bug: https://issuetracker.google.com/issues/394760806?pli=1
		if (properties.browser === 'firefox') {
			await driver.manage().window().maximize();
		}

		const recordFullScreen = !!properties.recording && !properties.headless;
		if (recordFullScreen && !this.isRecordingFullScreen) {
			this.isRecordingFullScreen = true;
			const ffmpegCommand = [
				'ffmpeg -hide_banner -loglevel warning -nostdin -y',
				` -video_size 1920x1080 -framerate ${properties.frameRate} -f x11grab -i :10`,
				` -f pulse -i 0 `,
				`${LocalFilesRepository.FULLSCREEN_RECORDING_DIR}/session_${Date.now()}.mp4`,
			].join('');
			const logFileFd = await fsPromises.open(
				`${LocalFilesRepository.SCRIPTS_LOGS_DIR}/fullscreen_recording_ffmpeg.log`,
				'a',
			);
			this.recordingScript = await this.scriptRunnerService.run(
				ffmpegCommand,
				{
					detached: true,
					stdio: ['ignore', logFileFd.fd, logFileFd.fd],
					onCloseCallback: code => {
						console.log(
							`Recording process exited with code ${code}`,
						);
						this.isRecordingFullScreen = false;
					},
				},
			);
			await logFileFd.close();
		}
	}

	private async waitForConnection(
		driver: WebDriver,
		request: CreateUserBrowser,
	): Promise<void> {
		// Wait until connection has been created
		await driver.wait(
			until.elementsLocated(By.id('local-connection-created')),
			this.BROWSER_WAIT_TIMEOUT_MS,
		);
		let currentPublishers = 0;
		if (request.properties.role === Role.PUBLISHER) {
			// Wait until publisher has been published regardless of whether the videos are shown or not
			await driver.wait(
				until.elementsLocated(By.id('local-stream-created')),
				this.BROWSER_WAIT_TIMEOUT_MS,
			);
			currentPublishers++;
		}
		// As subscribers are created muted because of user gesture policies, we need to unmute subscriber manually
		// await driver.wait(until.elementsLocated(By.id('subscriber-need-to-be-unmuted')), this.BROWSER_WAIT_TIMEOUT_MS);
		await driver.sleep(1000);
		await this.clickUnmuteButtons();
		console.log('Browser works as expected');
		const publisherVideos = await driver.findElements(
			By.css('[id^="remote-video-str"]'),
		);
		this.totalPublishers = currentPublishers + publisherVideos.length;
	}

	private setupKeepAlive(driver: WebDriver, driverId: string): void {
		// Workaround, currently browsers timeout after 1h unless we send an HTTP request to Selenium
		// set interval each minute to send a request to Selenium
		const keepAliveInterval = setInterval(() => {
			void driver.executeScript(() => {
				return true;
			});
		}, 60000);
		this.keepAliveIntervals.set(driverId, keepAliveInterval);
	}

	private async handleBrowserError(driverId: string): Promise<void> {
		const driver = this.driverMap.get(driverId);
		if (driver) {
			await this.printBrowserLogs(driverId);
			await this.deleteStreamManagerWithConnectionId(driverId);
		} else {
			console.log('Driver already quit.');
		}
	}

	async clickUnmuteButtons() {
		for (const driverObj of this.driverMap.values()) {
			const driver = driverObj.driver;
			// Add mutex here to ensure only one browser is clicking buttons at a time
			await this.muteButtonMutex.runExclusive(async () => {
				try {
					await this.clickButtonsWithRetry(driver);
				} catch (error) {
					console.error('Error clicking buttons', error);
				}
			});
		}
	}

	async clickButtonsWithRetry(driver: WebDriver, retries = 3) {
		let attempt = 0;
		let time = 500;
		while (attempt < retries) {
			try {
				const buttons = await driver.findElements(
					By.id('subscriber-need-to-be-unmuted'),
				);
				for (const button of buttons) {
					await button.click();
				}
				return;
			} catch (error) {
				attempt++;
				await new Promise(resolve => setTimeout(resolve, time));
				time *= 2;
				console.error('Error clicking buttons, retrying', error);
			}
		}
		throw new Error('Button could not be clicked after multiple attempts');
	}

	getStreamsCreated(): number {
		let result = 0;
		this.connections.forEach(
			(value: { publishers: string[]; subscribers: string[] }) => {
				const streamsSent = value.publishers.length;
				let streamsReceived = 0;
				const publishersInWorker = value.publishers.length;
				let externalPublishers =
					this.totalPublishers - publishersInWorker;
				if (externalPublishers < 0) {
					externalPublishers = 0;
				}
				// Add all streams subscribed by publishers
				streamsReceived =
					publishersInWorker * externalPublishers +
					publishersInWorker * (publishersInWorker - 1);

				streamsReceived +=
					value.subscribers.length * this.totalPublishers;
				result += streamsSent + streamsReceived;
			},
		);

		return result;
	}

	getParticipantsCreated(): number {
		return this.driverMap.size;
	}

	storeConnection(connectionId: string, properties: UserJoinProperties) {
		const conn = this.connections.get(properties.sessionName);
		if (conn) {
			if (properties.role === Role.PUBLISHER) {
				conn.publishers.push(connectionId);
			} else {
				conn.subscribers.push(connectionId);
			}
		} else {
			const subscribers = [];
			const publishers = [];
			if (properties.role === Role.PUBLISHER) {
				publishers.push(connectionId);
			} else {
				subscribers.push(connectionId);
			}
			this.connections.set(properties.sessionName, {
				publishers,
				subscribers,
			});
		}
	}

	private deleteConnection(
		sessionName: string,
		connectionId: string,
		role: Role,
	) {
		const value = this.connections.get(sessionName);
		if (value) {
			let index = -1;
			if (role === Role.PUBLISHER) {
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

	private async saveQoERecordings(driverId: string) {
		if (!!process.env.QOE_ANALYSIS && !!driverId) {
			console.log('Saving QoE Recordings for driver ' + driverId);
			const driverInfo = this.driverMap.get(driverId);
			if (driverInfo) {
				const webDriver = driverInfo.driver;
				if (webDriver) {
					console.log(
						'Executing getRecordings for driver ' + driverId,
					);
					try {
						await webDriver.executeAsyncScript(`
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
						console.log(
							'QoE Recordings saved for driver ' + driverId,
						);
						await this.printBrowserLogs(driverId);
					} catch (error) {
						console.log(
							'Error saving QoE Recordings for driver ' +
								driverId,
						);
						console.log(error);
						await this.printBrowserLogs(driverId);
					}
					this.driverMap.delete(driverId);
				}
			}
		}
	}

	private async printBrowserLogs(driverId: string) {
		const driverInfo = this.driverMap.get(driverId);
		if (driverInfo && driverInfo.browser !== 'firefox') {
			const entries = await driverInfo.driver
				.manage()
				.logs()
				.get(logging.Type.BROWSER);
			if (entries) {
				function formatTime(s: number): string {
					const dtFormat = new Intl.DateTimeFormat('en-GB', {
						timeStyle: 'medium',
						timeZone: 'UTC',
					});

					return dtFormat.format(new Date(s * 1e3));
				}

				entries.forEach(function (entry) {
					console.log(
						'%s - [%s] %s',
						formatTime(entry.timestamp),
						entry.level.name,
						entry.message,
					);
				});
			}
		}
	}
}
