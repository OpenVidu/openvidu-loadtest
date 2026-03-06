import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

export class LocalFilesRepository {
	public static readonly FULLSCREEN_RECORDING_DIR = `${process.cwd()}/recordings/chrome`;
	public static readonly QOE_RECORDING_DIR = `${process.cwd()}/recordings/qoe`;
	public static readonly STATS_DIR = `${process.cwd()}/stats`;
	public static readonly MEDIAFILES_DIR = `${process.cwd()}/src/assets/mediafiles`;

	constructor() {
		this.createNeededDirectories();
	}

	private createNeededDirectories() {
		if (!fs.existsSync(LocalFilesRepository.FULLSCREEN_RECORDING_DIR)) {
			fs.mkdirSync(LocalFilesRepository.FULLSCREEN_RECORDING_DIR, {
				recursive: true,
			});
		}
		if (!fs.existsSync(LocalFilesRepository.QOE_RECORDING_DIR)) {
			fs.mkdirSync(LocalFilesRepository.QOE_RECORDING_DIR, {
				recursive: true,
			});
		}
		if (!fs.existsSync(LocalFilesRepository.STATS_DIR)) {
			fs.mkdirSync(LocalFilesRepository.STATS_DIR, { recursive: true });
		}
		if (!fs.existsSync(LocalFilesRepository.MEDIAFILES_DIR)) {
			fs.mkdirSync(LocalFilesRepository.MEDIAFILES_DIR, {
				recursive: true,
			});
		}
	}

	public async downloadFile(
		name: string,
		fileUrl: string,
		fileDir: string,
	): Promise<string> {
		const filePath = fileDir + '/' + name;
		try {
			await fsPromises.access(fileDir, fs.constants.W_OK);
		} catch (err: unknown) {
			if (err instanceof Error) {
				throw new Error(
					'Directory ' + fileDir + ' is not writable\n' + err.message,
				);
			}
		}
		const file = fs.createWriteStream(filePath);
		console.log('Downloading ' + fileUrl + ' to ' + filePath);
		return this.download(fileUrl, filePath, file);
	}

	private async download(
		fileUrl: string,
		filePath: string,
		file: fs.WriteStream,
	): Promise<string> {
		const protocol = new URL(fileUrl).protocol.slice(0, -1);
		const httpModule = protocol === 'https' ? https : http;
		return new Promise<string>((resolve, reject) => {
			httpModule
				.get(fileUrl, (response: http.IncomingMessage) => {
					if (
						!!response.statusCode &&
						response.statusCode >= 200 &&
						response.statusCode < 300
					) {
						response.pipe(file);
						file.on('finish', () => {
							file.close();
							console.log(
								'Download of ' + filePath + ' successful',
							);
							resolve(filePath);
						});
					} else if (response.headers.location) {
						this.download(response.headers.location, filePath, file)
							.then(filePath => resolve(filePath))
							.catch((err: unknown) => {
								if (err instanceof Error) {
									reject(err);
								} else {
									reject(
										new Error(
											'Unknown error during download',
										),
									);
								}
							});
					} else {
						reject(
							new Error(
								response.statusCode +
									' ' +
									response.statusMessage,
							),
						);
					}
				})
				.on('error', err => {
					console.error(err);
					reject(err);
				});
		});
	}
}
