import fs = require('fs');
import https = require('https');
import * as express from "express";

import { APPLICATION_MODE, EMULATED_USER_TYPE, SERVER_PORT } from "./config";
import { HackService } from "./services/hack.service";

import {app as ovBrowserController} from './controllers/openvidu-browser.controller';
import {app as webrtcStatsController} from './controllers/webrtc-stats.controller';
import {app as instanceController} from './controllers/instance.controller';

import { InstanceService } from './services/instance.service';
import { ApplicationMode, EmulatedUserType } from './types/config.type';

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
app.use('/instance', instanceController);

const server = https.createServer(options, app);

server.listen(SERVER_PORT, async () => {
	const hack = new HackService();
	const instanceService = InstanceService.getInstance();

	if(APPLICATION_MODE === ApplicationMode.PROD) {
		console.log("Pulling Docker images needed...");
		await instanceService.pullImagesNeeded();
	}

	if(EMULATED_USER_TYPE === EmulatedUserType.KMS) {
		await instanceService.cleanEnvironment();
		console.log('Starting Kurento Media Server');
		await instanceService.launchKMS();
	}

	hack.openviduBrowser();
	await hack.webrtc();
	hack.websocket();
	hack.platform();
	hack.allowSelfSignedCertificate();

	console.log("---------------------------------------------------------");
	console.log(" ");
	console.log(`Service started in ${APPLICATION_MODE} mode`);
	console.log(`Emulated user type: ${EMULATED_USER_TYPE}`);
	console.log(`Listening in port ${SERVER_PORT}`);
	console.log(" ");
	console.log("---------------------------------------------------------");
});

