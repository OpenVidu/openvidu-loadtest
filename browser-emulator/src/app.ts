import fs from 'node:fs';
import https from 'node:https';
import express from 'express';
import { getContainer, resetContainer } from './container.js';
import { asyncExitHook } from 'exit-hook';

let app: express.Application;
let server: https.Server;

async function cleanup() {
	const container = await getContainer();
	const browserManager = container.resolve('browserManagerService');
	try {
		await browserManager.clean();
	} catch (err) {
		console.error(err);
	}
	const remotePersistenceService = container.resolve(
		'remotePersistenceService',
	);
	remotePersistenceService.clean();
	const fakeMediaDevicesService = container.resolve(
		'fakeMediaDevicesService',
	);
	await fakeMediaDevicesService.cleanupFakeMediaDevices();
	const scriptRunnerService = container.resolve('scriptRunnerService');
	await scriptRunnerService.killAllDetached();
	const instanceService = container.resolve('instanceService');
	await instanceService.removeMetricBeat();
}

async function createServer() {
	const container = await getContainer();
	app = express();

	const comModuleInstance = container.resolve('comModule');
	const publicDir = comModuleInstance.PUBLIC_DIR;
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

	app.use('/', container.resolve('eventsController').getRouter());
	app.use(
		'/openvidu-browser',
		container.resolve('openViduBrowserController').getRouter(),
	);
	app.use('/instance', container.resolve('instanceController').getRouter());
	app.use('/qoe', container.resolve('qoeController').getRouter());

	const options = {
		key: fs.readFileSync(publicDir + '/key.pem', 'utf8'),
		cert: fs.readFileSync(publicDir + '/cert.pem', 'utf8'),
	};
	server = https.createServer(options, app);
}

export async function startServer() {
	const container = await getContainer();
	const configService = container.resolve('configService');
	const serverPort = configService.getServerPort();
	await createServer();

	server.listen(serverPort, () => {
		try {
			const pythonpath = process.env.PYTHONPATH;
			if (pythonpath) {
				process.env.PYTHONPATH = pythonpath + ':' + process.cwd();
			} else {
				process.env.PYTHONPATH = process.cwd();
			}

			asyncExitHook(
				async () => {
					console.log('Cleaning up before exit...');
					await cleanup();
					console.log('Cleanup completed. Exiting now.');
				},
				{ wait: 7.2e6 }, // 2 hours in milliseconds, to allow enough time for cleanup
			);

			console.log(
				'---------------------------------------------------------',
			);
			console.log(' ');
			console.log(
				`Service started with communication module: ${configService.getComModule()}`,
			);
			console.log(`API REST is listening in port ${serverPort}`);
			console.log(' ');
			console.log(
				'---------------------------------------------------------',
			);
			const instanceService = container.resolve('instanceService');
			instanceService.setInstanceReady();
		} catch (error) {
			console.error(error);
		}
	});

	const wsService = container.resolve('wsService');
	wsService.initializeServer(server);
	return { app, server };
}

export async function stopServer() {
	const container = await getContainer();
	const wsService = container.resolve('wsService');
	await wsService.close();
	await cleanup();
	await resetContainer();
	if (server) {
		return new Promise<void>((resolve, reject) => {
			server.close(err => {
				if (err) {
					console.error('Error closing server:', err);
					reject(err);
				} else {
					console.log('Server stopped');
					resolve();
				}
			});
		});
	}
}
