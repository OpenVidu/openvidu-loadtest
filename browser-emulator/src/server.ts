import fs = require('fs');
import https = require('https');
import * as express from 'express';
import { APPLICATION_MODE, COM_MODULE, EMULATED_USER_TYPE, SERVER_PORT, WEBSOCKET_PORT } from './config';
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
import { FilesService } from './services/files/files.service';

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

let publicDir: string;
let comModuleInstance;
if (!!COM_MODULE) {
	let moduleName = COM_MODULE.trim();
	const ComModule = require(`./com-modules/${moduleName}`);
	comModuleInstance = ComModule.default.getInstance();
	publicDir = ComModule.PUBLIC_DIR;
} else {
	console.log('COM_MODULE environment variable is not set. Using default com-module (OpenVidu 2)');
	const OpenviduComModule = require('./com-modules/openvidu');
	comModuleInstance = OpenviduComModule.default.getInstance();
	publicDir = OpenviduComModule.PUBLIC_DIR;
}

app.use(express.static(publicDir));

const options = {
	key: fs.readFileSync(publicDir + '/key.pem', 'utf8'),
	cert: fs.readFileSync(publicDir + '/cert.pem', 'utf8'),
};

app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/', eventsController);
app.use('/openvidu-browser', ovBrowserController);
app.use('/instance', instanceController);
app.use('/qoe', qoeController);

const server = https.createServer(options, app);

server.listen(SERVER_PORT, async () => {
	const hack = new HackService();
	const instanceService = InstanceService.getInstance();

	try {
		if (!fs.existsSync(`${process.cwd()}/src/assets/mediafiles`)){
			fs.mkdirSync(`${process.cwd()}/src/assets/mediafiles`, { recursive: true });
		}
		for (const directory of FilesService.fileDirs) {
			if (!fs.existsSync(directory)) {
				fs.mkdirSync(directory, { recursive: true });
			}
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
