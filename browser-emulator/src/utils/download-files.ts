import fs from 'fs';
import { URL } from 'url';
import fsPromises from 'fs/promises';
import http from 'http';
import https from 'https';

export async function downloadFile(
	name: string,
	fileUrl: string,
	fileDir: string,
): Promise<string> {
	const filePath = fileDir + '/' + name;
	try {
		await fsPromises.access(fileDir, fs.constants.W_OK);
	} catch (err) {
		throw new Error('Directory ' + fileDir + ' is not writable\n' + err);
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
	const promise: Promise<string> = new Promise(async (resolve, reject) => {
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
						.catch(err => reject(err));
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
