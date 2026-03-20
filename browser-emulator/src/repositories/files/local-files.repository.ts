import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';

export class LocalFilesRepository {
	// TODO: These directories could be moved to the config service
	public static readonly FULLSCREEN_RECORDING_DIR = `${process.cwd()}/recordings/chrome`;
	public static readonly QOE_RECORDING_DIR = `${process.cwd()}/recordings/qoe`;
	public static readonly STATS_DIR = `${process.cwd()}/stats`;
	public static readonly MEDIAFILES_DIR = `${process.cwd()}/mediafiles`;
	public static readonly SCRIPTS_LOGS_DIR = `${process.cwd()}/logs`;

	private _fakevideo: string | undefined;
	private _fakeaudio: string | undefined;

	constructor() {
		this.createNeededDirectories();
	}

	public get fakevideo(): string | undefined {
		return this._fakevideo;
	}

	public get fakeaudio(): string | undefined {
		return this._fakeaudio;
	}

	private createNeededDirectories() {
		const requiredDirs = [
			LocalFilesRepository.FULLSCREEN_RECORDING_DIR,
			LocalFilesRepository.QOE_RECORDING_DIR,
			LocalFilesRepository.STATS_DIR,
			LocalFilesRepository.MEDIAFILES_DIR,
			LocalFilesRepository.SCRIPTS_LOGS_DIR,
		];

		requiredDirs.forEach(dir => fs.mkdirSync(dir, { recursive: true }));
	}

	public async downloadMediaFiles(
		videoFile: string,
		videoUrl: string,
		audioFile: string,
		audioUrl: string,
	): Promise<string[]> {
		const filePaths = await Promise.all([
			this.downloadFile(videoFile, videoUrl),
			this.downloadFile(audioFile, audioUrl),
		]);
		this._fakevideo = filePaths[0];
		this._fakeaudio = filePaths[1];

		return filePaths;
	}

	private async downloadFile(name: string, fileUrl: string): Promise<string> {
		const filePath = LocalFilesRepository.MEDIAFILES_DIR + '/' + name;
		try {
			await fsPromises.access(
				LocalFilesRepository.MEDIAFILES_DIR,
				fs.constants.W_OK,
			);
		} catch (err: unknown) {
			if (err instanceof Error) {
				throw new Error(
					'Directory ' +
						LocalFilesRepository.MEDIAFILES_DIR +
						' is not writable\n' +
						err.message,
				);
			}
		}

		const fileExistsLocally = await this.fileExists(filePath);
		if (fileExistsLocally) {
			const remoteSha256 = await this.getRemoteSha256Header(fileUrl);
			if (remoteSha256) {
				const localSha256 = await this.calculateFileSha256(filePath);
				if (localSha256.toLowerCase() === remoteSha256.toLowerCase()) {
					console.log(
						'File ' +
							filePath +
							' already exists with matching SHA-256',
					);
					return filePath;
				}
			}
		}

		const file = fs.createWriteStream(filePath);
		console.log('Downloading ' + fileUrl + ' to ' + filePath);
		return this.download(fileUrl, filePath, file);
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fsPromises.access(filePath, fs.constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	private async calculateFileSha256(filePath: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const hash = createHash('sha256');
			const readStream = fs.createReadStream(filePath);

			readStream.on('data', chunk => hash.update(chunk));
			readStream.on('end', () => resolve(hash.digest('hex')));
			readStream.on('error', err => reject(err));
		});
	}

	private async getRemoteSha256Header(
		fileUrl: string,
	): Promise<string | undefined> {
		const headers = await this.headRequest(fileUrl);
		const shaHeader = headers['x-amz-meta-sha256'];
		if (Array.isArray(shaHeader)) {
			return shaHeader[0]?.trim();
		}
		return shaHeader?.trim();
	}

	private async headRequest(
		fileUrl: string,
	): Promise<http.IncomingHttpHeaders> {
		const requestUrl = new URL(fileUrl);
		const protocol = requestUrl.protocol.slice(0, -1);
		const httpModule = protocol === 'https' ? https : http;

		return new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
			const request = httpModule.request(
				requestUrl,
				{ method: 'HEAD' },
				(response: http.IncomingMessage) => {
					if (
						!!response.statusCode &&
						response.statusCode >= 200 &&
						response.statusCode < 300
					) {
						resolve(response.headers);
						return;
					}

					if (response.headers.location) {
						const redirectUrl = new URL(
							response.headers.location,
							requestUrl,
						).toString();
						this.headRequest(redirectUrl)
							.then(resolve)
							.catch(reject);
						return;
					}

					reject(
						new Error(
							response.statusCode + ' ' + response.statusMessage,
						),
					);
				},
			);

			request.on('error', err => reject(err));
			request.end();
		});
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

	public async existMediaFiles() {
		if (!this._fakevideo || !this._fakeaudio) {
			return false;
		}
		try {
			await Promise.all([
				fsPromises.access(this._fakevideo, fs.constants.F_OK),
				fsPromises.access(this._fakeaudio, fs.constants.F_OK),
			]);
			return true;
		} catch {
			return false;
		}
	}
}
