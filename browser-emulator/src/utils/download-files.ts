import https = require('https');
import fs = require('fs');

export async function downloadFile(name: string, fileUrl: string, fileDir: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const filePath = fileDir + "/" + name;
		fs.access(fileDir, fs.constants.W_OK, (err) => {
			if (err) {
				console.error(`${filePath} is not writable`);
				reject(err);
			}
			const file = fs.createWriteStream(filePath);
			console.log("Downloading " + fileUrl + " to " + filePath);
			const request = https.get(fileUrl, function (response) {
				response.pipe(file);
				file.on("finish", () => {
					file.close();
					console.log("Download of " + filePath + " successful");
					resolve(filePath);
				})
			}).on('error', (err) => {
				console.error(err);
				reject(err);
			});
		})
	})
}
