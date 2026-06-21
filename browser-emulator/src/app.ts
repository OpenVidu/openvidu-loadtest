import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import express from 'express';
import { getContainer, resetContainer } from './container.js';
import { asyncExitHook } from 'exit-hook';
import baseLogger from './services/logger.service.js';

const logger = baseLogger.child({ module: 'app' });

let app: express.Application;
let server: http.Server | https.Server;

async function cleanup() {
	const container = await getContainer();
	const browserManager = container.resolve('browserManagerService');
	const configService = container.resolve('configService');
	const scriptRunnerService = container.resolve('scriptRunnerService');
	const instanceService = container.resolve('instanceService');
	const remotePersistenceService = container.resolve(
		'remotePersistenceService',
	);
	const emulatedFilePublishStreamService = container.resolve(
		'emulatedFilePublishStreamService',
	);
	const socketWriterService = container.resolve('socketWriterService');
	try {
		await browserManager.clean();
	} catch (err) {
		logger.error(err);
	}
	remotePersistenceService.clean();
	if (configService.isLegacyMode()) {
		const fakeMediaDevicesService = container.resolve(
			'fakeMediaDevicesService',
		);
		await fakeMediaDevicesService.cleanupFakeMediaDevices();
	}
	await Promise.all([
		scriptRunnerService.killAllDetached(),
		instanceService.removeMetricBeat(),
		emulatedFilePublishStreamService.stopPublishing(),
		socketWriterService.stopAllWriters(),
	]);
	logger.info('Cleanup finished');
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

	const configService = container.resolve('configService');
	if (configService.isHttpsDisabled()) {
		// In development we may prefer plain HTTP to avoid mixed-content
		// issues when other services (like LiveKit) aren't using TLS.
		server = http.createServer(app);
	} else {
		const options = {
			key: fs.readFileSync(publicDir + '/key.pem', 'utf8'),
			cert: fs.readFileSync(publicDir + '/cert.pem', 'utf8'),
		};
		server = https.createServer(options, app);
	}
}

export async function startServer() {
	const container = await getContainer();
	const configService = container.resolve('configService');
	const serverPort = configService.getServerPort();
	await createServer();

	server.listen(serverPort, () => {
		try {
			asyncExitHook(
				async () => {
					logger.info('Cleaning up before exit...');
					await cleanup();
					logger.info('Cleanup completed. Exiting now.');
				},
				{ wait: 7.2e6 }, // 2 hours in milliseconds, to allow enough time for cleanup
			);

			logger.info(
				'---------------------------------------------------------',
			);
			logger.info(' ');
			logger.info(
				`Service started with communication module: ${configService.getComModule()}`,
			);
			logger.info(`API REST is listening in port ${serverPort}`);
			logger.info(' ');
			logger.info(
				'---------------------------------------------------------',
			);
			const instanceService = container.resolve('instanceService');
			instanceService.setInstanceReady();
		} catch (error) {
			logger.error(error);
		}
	});

	const wsService = container.resolve('wsService');
	wsService.initializeServer();
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
					logger.error(err, 'Error closing server');
					reject(err);
				} else {
					logger.info('Server stopped');
					resolve();
				}
			});
		});
	}
}
