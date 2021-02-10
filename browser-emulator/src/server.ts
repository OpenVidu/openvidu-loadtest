import * as express from "express";
import { SERVER_PORT } from "./config";
import { Hack } from "./extra/hack";
import {app as ovBrowserController} from './controllers/openvidu-browser';
import {app as browserEmulatorController} from './controllers/browser-emulator';
import fs = require('fs');
import https = require('https');
const app = express();

app.use(express.static('public'));

const options = {
	key: fs.readFileSync('public/key.pem', 'utf8'),
	cert: fs.readFileSync('public/cert.pem', 'utf8'),
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/browser-emulator', browserEmulatorController);
app.use('/openvidu-browser', ovBrowserController);

const server = https.createServer(options, app);

server.listen(SERVER_PORT, () => {
	const hack = new Hack();

	hack.openviduBrowser();
	hack.webrtc();
	hack.websocket();

	createRecordingsDirectory();

	console.log("---------------------------------------------------------");
	console.log(" ");
	console.log(`Listening in port ${SERVER_PORT}`);
	console.log(" ");
	console.log("---------------------------------------------------------");
});

function createRecordingsDirectory() {
	var dir = `${process.env.PWD}/recordings`;
	if (!fs.existsSync(dir)){
		fs.mkdirSync(dir);
	}
}