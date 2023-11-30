import fs = require('fs');
import https = require('https');
import * as express from 'express';
import { APPLICATION_MODE, COM_MODULE, EMULATED_USER_TYPE, SERVER_PORT, WEBSOCKET_PORT, comModuleInstance } from './config';
import { HackService } from './services/hack.service';

import { app as ovBrowserController } from './controllers/openvidu-browser.controller';
import { app as eventsController } from './controllers/events.controller';
import { app as instanceController } from './controllers/instance.controller';
import { app as qoeController } from './controllers/qoe.controller';

import { InstanceService } from './services/instance.service';
import { ApplicationMode, EmulatedUserType } from './types/config.type';
import { WsService } from './services/ws.service';
import WebSocket = require('ws');
import nodeCleanup = require('node-cleanup');

import { BrowserManagerService } from './services/browser-manager.service';
import { killAllDetached } from './utils/run-script';
import { cleanupFakeMediaDevices } from './utils/fake-media-devices';
import { OpenviduComModule } from './com-modules/openvidu';

async function cleanup() {
	const browserManager = BrowserManagerService.getInstance();
	try {
		await browserManager.clean();
	} catch (err) {
		console.error(err);
	}
	killAllDetached();
	await cleanupFakeMediaDevices();
}

const app: any = express();
const ws = new WebSocket.Server({ port: WEBSOCKET_PORT, path: '/events' });

app.use(express.static(COM_MODULE));

const options = {
	key: fs.readFileSync(COM_MODULE + '/key.pem', 'utf8'),
	cert: fs.readFileSync(COM_MODULE + '/cert.pem', 'utf8'),
};

if (!!COM_MODULE) {
	OpenviduComModule.getInstance();
}

app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', eventsController);
app.use('/openvidu-browser', ovBrowserController);
app.use('/instance', instanceController);
app.use('/qoe', qoeController);

const server = https.createServer(options, app);

server.listen(SERVER_PORT, async () => {
	const hack = new HackService();
	const instanceService = InstanceService.getInstance();

	try {
		if (!fs.existsSync(`${process.env.PWD}/src/assets/mediafiles`)){
			fs.mkdirSync(`${process.env.PWD}/src/assets/mediafiles`);
		}
		if (APPLICATION_MODE === ApplicationMode.PROD) {
			console.log('Pulling Docker images needed...');
			await instanceService.pullImagesNeeded();
		}

		if (EMULATED_USER_TYPE === EmulatedUserType.KMS) {
			await instanceService.cleanEnvironment();
			await instanceService.launchKMS();
		}

		hack.openviduBrowser();
		await hack.webrtc();
		hack.websocket();
		hack.platform();
		hack.allowSelfSignedCertificate();

		const pythonpath = process.env['PYTHONPATH']
		if (!pythonpath) {
			process.env['PYTHONPATH'] = pythonpath + ':' + process.env['PWD']
		} else {
			process.env['PYTHONPATH'] = process.env['PWD']
		}

		nodeCleanup(() => {
			cleanup();
			nodeCleanup.uninstall();
			return false;
		});

		console.log('---------------------------------------------------------');
		console.log(' ');
		console.log(`Service started in ${APPLICATION_MODE} mode`);
		console.log(`Emulated user type: ${EMULATED_USER_TYPE}`);
		console.log(`API REST is listening in port ${SERVER_PORT}`);
		console.log(`WebSocket is listening in port ${WEBSOCKET_PORT}`);
		console.log(' ');
		console.log('---------------------------------------------------------');
		instanceService.instanceInitialized();
	} catch (error) {
		console.error(error);
	}
});

ws.on('connection', (ws: WebSocket) => {
	WsService.getInstance().setWebsocket(ws);
});
