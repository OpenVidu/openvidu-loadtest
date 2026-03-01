import fs from 'node:fs';
import { URL } from 'node:url';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';

export async function downloadFile(
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
	return download(fileUrl, filePath, file);
}

async function download(
	fileUrl: string,
	filePath: string,
	file: fs.WriteStream,
): Promise<string> {
	const protocol = new URL(fileUrl).protocol.slice(0, -1);
	const httpModule = protocol === 'https' ? https : http;
	const promise = new Promise<string>((resolve, reject) => {
		httpModule
			.get(fileUrl, function (response: http.IncomingMessage) {
				if (
					!!response.statusCode &&
					response.statusCode >= 200 &&
					response.statusCode < 300
				) {
					response.pipe(file);
					file.on('finish', () => {
						file.close();
						console.log('Download of ' + filePath + ' successful');
						resolve(filePath);
					});
				} else if (response.headers.location) {
					download(response.headers.location, filePath, file)
						.then(filePath => resolve(filePath))
						.catch(err => {
							if (err instanceof Error) {
								reject(err);
							} else {
								reject(
									new Error('Unknown error during download'),
								);
							}
						});
				} else {
					reject(
						new Error(
							response.statusCode + ' ' + response.statusMessage,
						),
					);
				}
			})
			.on('error', err => {
				console.error(err);
				reject(err);
			});
	});
	return promise;
}
