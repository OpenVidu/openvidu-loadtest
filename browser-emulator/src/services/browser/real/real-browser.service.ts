import { By, logging, until, WebDriver } from 'selenium-webdriver';
import type { Storage } from '../../local-storage.service.js';
import type {
	StorageNameObject,
	StorageValueObject,
} from '../../../types/storage-config.type.js';
import { SeleniumService } from './selenium.service.js';
import { Mutex } from 'async-mutex';
import type BaseComModule from '../../../com-modules/base.ts';
import { LocalFilesRepository } from '../../../repositories/files/local-files.repository.ts';
import {
	type AvailableBrowsers,
	type CreateUserBrowser,
	type UserJoinProperties,
	Role,
} from '../../../types/create-user.type.ts';
import type { LoggerService } from '../../logger.service.ts';

declare let localStorage: Storage;

interface DriverInfo {
	driver: WebDriver;
	sessionName: string;
	userName: string;
	connectionRole: Role;
	browser: AvailableBrowsers;
	mediaRecorders: boolean;
}

export class RealBrowserService {
	private readonly BROWSER_WAIT_TIMEOUT_MS = 30000;
	private readonly driverMap = new Map<string, DriverInfo>();
	private readonly keepAliveIntervals = new Map<string, NodeJS.Timeout>();
	private readonly muteButtonMutex = new Mutex();
	private readonly seleniumService: SeleniumService;
	private readonly localFilesRepository: LocalFilesRepository;
	private readonly comModule: BaseComModule;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	constructor(
		seleniumService: SeleniumService,
		comModule: BaseComModule,
		localFilesRepository: LocalFilesRepository,
		loggerService: LoggerService,
	) {
		this.seleniumService = seleniumService;
		this.comModule = comModule;
		this.localFilesRepository = localFilesRepository;
		this.logger = loggerService.getLogger('RealBrowserService');
	}

	async deleteStreamManagerWithConnectionId(driverId: string): Promise<void> {
		this.logger.info({ driverId }, 'Removing and stopping driver');
		const value = this.driverMap.get(driverId);
		const keepAliveInterval = this.keepAliveIntervals.get(driverId);
		if (keepAliveInterval) {
			clearInterval(keepAliveInterval);
			this.keepAliveIntervals.delete(driverId);
		}
		if (value) {
			if (value.mediaRecorders) {
				await this.saveQoERecordings(driverId);
			}
			await this.seleniumService.quitDriver(value.driver);
			this.driverMap.delete(driverId);
		}
	}

	async deleteStreamManagerWithSessionAndUser(
		sessionId: string,
		userId: string,
	) {
		// find entry in driverMap
		const driversToDelete: {
			key: string;
			value: DriverInfo;
		}[] = [];
		const promisesToResolve: Promise<void>[] = [];
		const recordingPromises: Promise<void>[] = [];
		this.driverMap.forEach((value, key) => {
			if (value.sessionName === sessionId && value.userName === userId) {
				driversToDelete.push({ key, value });
				if (value.mediaRecorders) {
					recordingPromises.push(this.saveQoERecordings(key));
				}
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
			this.logger.error({ error }, 'Error quitting driver');
		}
	}

	async deleteStreamManagerWithRole(role: Role): Promise<void> {
		this.logger.info(
			{ totalUsers: this.driverMap.size },
			'Current number of total users in worker',
		);
		this.logger.info({ role }, 'Deleting all role');
		const driversToDelete: {
			key: string;
			value: DriverInfo;
		}[] = [];
		const promisesToResolve: Promise<void>[] = [];
		const recordingPromises: Promise<void>[] = [];
		this.driverMap.forEach((value, key) => {
			if (value.connectionRole === role) {
				driversToDelete.push({ key, value });
				this.logger.info(
					{ driverId: key, sessionName: value.sessionName },
					'Driver to delete',
				);
				if (value.mediaRecorders) {
					recordingPromises.push(this.saveQoERecordings(key));
				}
			}
		});
		this.logger.info(
			{ numberToDelete: driversToDelete.length },
			'Number of users to delete',
		);
		if (recordingPromises.length > 0) {
			this.logger.info('Saving QoE Recordings...');
			await Promise.all(recordingPromises);
			this.logger.info('QoE recordings saved');
		}
		this.logger.info('Clearing keep alive intervals');
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
			this.logger.error({ error }, 'Error quitting driver');
		}
	}

	private async quitDriver(key: string, value: DriverInfo) {
		this.logger.info(
			{ driverId: key, sessionName: value.sessionName },
			'Quitting driver',
		);
		try {
			await this.seleniumService.quitDriver(value.driver);
			this.logger.info(
				{ driverId: key, sessionName: value.sessionName },
				'Driver quit successfully',
			);
		} catch (error) {
			this.logger.error(
				{ driverId: key, sessionName: value.sessionName, error },
				'Error quitting driver',
			);
		}
	}

	async clean(): Promise<void> {
		this.logger.info('Cleaning real browsers');
		await this.seleniumService.stopFullScreenRecording();
		await Promise.all([
			this.deleteStreamManagerWithRole(Role.PUBLISHER),
			this.deleteStreamManagerWithRole(Role.SUBSCRIBER),
		]);
		this.logger.info('Real browsers cleaned');
	}

	async launchBrowser(
		request: CreateUserBrowser,
		storageNameObj?: StorageNameObject,
		storageValueObj?: StorageValueObject,
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
			this.logger.info({ webappUrl }, 'Webapp URL');
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
			this.logger.error({ error }, 'Error initializing browser');
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

		if (properties.recording) {
			await this.seleniumService.recordFullScreen(properties);
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
		if (request.properties.role === Role.PUBLISHER) {
			// Wait until publisher has been published regardless of whether the videos are shown or not
			await driver.wait(
				until.elementsLocated(By.id('local-stream-created')),
				this.BROWSER_WAIT_TIMEOUT_MS,
			);
		}
		// As subscribers are created muted because of user gesture policies, we need to unmute subscriber manually
		// await driver.wait(until.elementsLocated(By.id('subscriber-need-to-be-unmuted')), this.BROWSER_WAIT_TIMEOUT_MS);
		await driver.sleep(1000);
		await this.clickUnmuteButtons();
		this.logger.info('Browser works as expected');
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
			this.logger.warn('Driver already quit.');
		}
	}

	async clickUnmuteButtons() {
		for (const driverObj of this.driverMap.values()) {
			const driver = driverObj.driver;
			// Add mutex here to ensure only one browser is clicking buttons at a time
			await this.muteButtonMutex.runExclusive(async () => {
				await this.clickButtonsWithRetry(driver);
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
				this.logger.error(
					{ error },
					'Error clicking buttons, retrying',
				);
			}
		}
		throw new Error('Button could not be clicked after multiple attempts');
	}

	private async saveQoERecordings(driverId: string) {
		this.logger.info({ driverId }, 'Saving QoE Recordings for driver');
		const driverInfo = this.driverMap.get(driverId);
		if (driverInfo) {
			const webDriver = driverInfo.driver;
			if (webDriver) {
				this.logger.info(
					{ driverId },
					'Executing getRecordings for driver',
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
					this.logger.info(
						{ driverId },
						'QoE Recordings saved for driver',
					);
					await this.printBrowserLogs(driverId);
				} catch (error) {
					this.logger.error(
						{ driverId, error },
						'Error saving QoE Recordings',
					);
					await this.printBrowserLogs(driverId);
				}
				this.driverMap.delete(driverId);
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

				entries.forEach(entry => {
					this.logger.info(
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
