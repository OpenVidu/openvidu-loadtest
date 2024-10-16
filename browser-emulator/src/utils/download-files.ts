import fs = require('fs');
import { URL } from 'url';
const fsPromises = fs.promises;

export async function downloadFile(name: string, fileUrl: string, fileDir: string): Promise<string> {
	const filePath = fileDir + "/" + name;
	try {
		await fsPromises.access(fileDir, fs.constants.W_OK);
	} catch (err) {
		throw new Error("Directory " + fileDir + " is not writable\n" + err);
	}
	const file = fs.createWriteStream(filePath);
	console.log("Downloading " + fileUrl + " to " + filePath);
	return download(fileUrl, filePath, file);
}

async function download(fileUrl: string, filePath: string, file: fs.WriteStream): Promise<string> {
	const protocol = new URL(fileUrl).protocol.slice(0, -1);
	const promise: Promise<string> = new Promise(async (resolve, reject) => {
		require(protocol).get(fileUrl,function (response) {
			if (response.statusCode >= 200 && response.statusCode < 300) {
				response.pipe(file);
				file.on("finish", () => {
					file.close();
					console.log("Download of " + filePath + " successful");
					resolve(filePath);
				})
			} else if (response.headers.location) {
				download(response.headers.location, filePath, file).then((filePath) => resolve(filePath)).catch((err) => reject(err));
			} else {
				reject(new Error(response.statusCode + ' ' + response.statusMessage));
			}
		}).on('error', (err) => {
			console.error(err);
			reject(err);
		});
	});
	return promise;
}