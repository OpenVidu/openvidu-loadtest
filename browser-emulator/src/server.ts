import fs from 'node:fs';
import https from 'node:https';
import express from 'express';
import {
	APPLICATION_MODE,
	COM_MODULE,
	SERVER_PORT,
	WEBSOCKET_PORT,
} from './config.js';

import { app as ovBrowserController } from './controllers/openvidu-browser.controller.js';
import { app as eventsController } from './controllers/events.controller.js';
import { app as instanceController } from './controllers/instance.controller.js';
import { app as qoeController } from './controllers/qoe.controller.js';

import { InstanceService } from './services/instance.service.js';
import { ApplicationMode } from './types/config.type.js';
import { WsService } from './services/ws.service.js';
import nodeCleanup from 'node-cleanup';

import { BrowserManagerService } from './services/browser-manager.service.js';
import { killAllDetached } from './utils/run-script.js';
import { cleanupFakeMediaDevices } from './utils/fake-media-devices.js';
import { S3FilesService } from './services/files/s3files.service.ts';

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

export async function createServer() {
	const app = express();

	let publicDir: string;
	if (COM_MODULE) {
		let moduleName = COM_MODULE.trim();
		const ComModule = await import(`./com-modules/${moduleName}.js`);
		ComModule.default.getInstance();
		publicDir = ComModule.PUBLIC_DIR;
	} else {
		console.warn(
			'COM_MODULE environment variable is not set. Using default com-module (OpenVidu 2)',
		);
		const OpenviduComModule = await import('./com-modules/openvidu.js');
		OpenviduComModule.default.getInstance();
		publicDir = OpenviduComModule.PUBLIC_DIR;
	}

	app.use(express.static(publicDir));

	app.use(
		(
			_: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			res.header('Access-Control-Allow-Origin', '*');
			res.header(
				'Access-Control-Allow-Headers',
				'Origin, X-Requested-With, Content-Type, Accept',
			);
			next();
		},
	);

	app.use(express.json({ limit: '50mb' }));
	app.use(express.urlencoded({ limit: '50mb', extended: true }));

	app.use('/', eventsController);
	app.use('/openvidu-browser', ovBrowserController);
	app.use('/instance', instanceController);
	app.use('/qoe', qoeController);

	const options = {
		key: fs.readFileSync(publicDir + '/key.pem', 'utf8'),
		cert: fs.readFileSync(publicDir + '/cert.pem', 'utf8'),
	};
	const server = https.createServer(options, app);
	return { app, server };
}

export async function startServer() {
	const { app, server } = await createServer();

	server.listen(SERVER_PORT, async () => {
		const instanceService = InstanceService.getInstance();

		try {
			if (!fs.existsSync(`${process.cwd()}/src/assets/mediafiles`)) {
				fs.mkdirSync(`${process.cwd()}/src/assets/mediafiles`, {
					recursive: true,
				});
			}
			for (const directory of S3FilesService.fileDirs) {
				if (!fs.existsSync(directory)) {
					fs.mkdirSync(directory, { recursive: true });
				}
			}
			if (APPLICATION_MODE === ApplicationMode.PROD) {
				console.log('Pulling Docker images needed...');
				await instanceService.pullImagesNeeded();
			}

			const pythonpath = process.env['PYTHONPATH'];
			if (pythonpath) {
				process.env['PYTHONPATH'] =
					pythonpath + ':' + process.env['PWD'];
			} else {
				process.env['PYTHONPATH'] = process.env['PWD'];
			}

			nodeCleanup(() => {
				cleanup();
				nodeCleanup.uninstall();
				return false;
			});

			console.log(
				'---------------------------------------------------------',
			);
			console.log(' ');
			console.log(`Service started in ${APPLICATION_MODE} mode`);
			console.log(`API REST is listening in port ${SERVER_PORT}`);
			console.log(`WebSocket is listening in port ${WEBSOCKET_PORT}`);
			console.log(' ');
			console.log(
				'---------------------------------------------------------',
			);
			instanceService.instanceInitialized();
		} catch (error) {
			console.error(error);
		}
	});

	await WsService.getInstance().initializeServer();
	return { app, server };
}

// In ES modules, check if this file is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
	await startServer();
}
