import { run } from './run-script.js';
import fsPromises from 'node:fs/promises';

let started = false;

export async function startFakeMediaDevices(
	videoPath: string,
	audioPath: string,
) {
	if (!started) {
		started = true;
		// Assumes ffmpeg installed, v4l2loopback installed and enabled, and pulseaudio installed,
		// check install scripts for guidance
		let loadedModules = '';
		try {
			await run('pactl list modules short', {
				stdoutCallback(chunk: string) {
					loadedModules += chunk;
				},
			});
			if (
				!(
					loadedModules.includes('module-pipe-source') &&
					loadedModules.includes('source_name=virtmic')
				)
			) {
				await run(
					`${process.cwd()}/recording_scripts/create-fake-microphone.sh`,
				);
			}
		} catch {
			await run(
				`${process.cwd()}/recording_scripts/create-fake-microphone.sh`,
			);
		}
		// Wait for V4L2 device to be ready
		let v4l2DeviceReady = false;
		let attempts = 0;
		while (!v4l2DeviceReady) {
			try {
				await fsPromises.access('/dev/video0');
				v4l2DeviceReady = true;
			} catch {
				if (attempts > 5) {
					console.error("Can't start V4L2 device");
					process.exit();
				}
				console.log('Waiting for V4L2 device to be ready...');
				await new Promise(resolve => setTimeout(resolve, 1000));
				attempts++;
			}
		}
		// Start ffmpeg to read video and audio from files and write to virtual webcam and microphone
		await run(
			`${process.cwd()}/recording_scripts/start-fake-media.sh ${videoPath} ${audioPath}`,
			{
				detached: true,
			},
		);
		console.log('Fake webcam started.');
		console.log('Fake microphone started.');
	}
}

export async function cleanupFakeMediaDevices() {
	try {
		await run(
			`${process.cwd()}/recording_scripts/clear-fake-microphone.sh`,
		);
	} catch (err) {
		console.error(err);
	}
}
