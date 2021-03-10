import fs = require('fs');
import https = require('https');
import * as express from "express";

import { APPLICATION_MODE, SERVER_PORT } from "./config";
import { HackService } from "./services/hack.service";

import {app as ovBrowserController} from './controllers/openvidu-browser.controller';
import {app as webrtcStatsController} from './controllers/webrtc-stats.controller';

import { DockerService } from './services/docker.service';
import { InstanceService } from './services/instance.service';
import { ApplicationMode } from './types/config.type';


const app = express();

app.use(express.static('public'));

const options = {
	key: fs.readFileSync('public/key.pem', 'utf8'),
	cert: fs.readFileSync('public/cert.pem', 'utf8'),
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', webrtcStatsController);
app.use('/openvidu-browser', ovBrowserController);

const server = https.createServer(options, app);

server.listen(SERVER_PORT, async () => {
	const hack = new HackService();
	hack.openviduBrowser();
	hack.webrtc();
	hack.websocket();
	hack.platform();
	hack.allowSelfSignedCertificate();

	createRecordingsDirectory();

	if(APPLICATION_MODE === ApplicationMode.PROD) {
		console.log("Pulling Docker images needed...");
		await new DockerService().pullImagesNeeded();
	}

	await InstanceService.getInstance().cleanEnvironment();

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