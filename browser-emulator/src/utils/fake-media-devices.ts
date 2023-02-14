import { runScript } from "./run-script";
import fs = require('fs');
const fsPromises = fs.promises;

let started = false;

export async function startFakeMediaDevices(videoPath: string, audioPath: string) {
    if (!started) {
        started = true;
        // Assumes ffmpeg installed, v4l2loopback installed and enabled, and pulseaudio installed, check prepare.sh for help
        let loadedModules = "";
        try {
            await runScript("pactl list modules short", {
                stdoutCallback(chunk) {
                    loadedModules += chunk;
                },
            })
            if (!(loadedModules.includes("module-pipe-source") && loadedModules.includes("source_name=virtmic"))) {
                await runScript(`${process.env.PWD}/recording_scripts/create-fake-microphone.sh`);
            }
        } catch (err) {
            await runScript(`${process.env.PWD}/recording_scripts/create-fake-microphone.sh`);
        }
        // Start ffmpeg to read video and audio from files and write to virtual webcam and microphone
        await runScript(`${process.env.PWD}/recording_scripts/start-fake-media.sh ${videoPath} ${audioPath}`, {
            detached: true
        });
        console.log("Fake webcam started.");
        console.log("Fake microphone started.");
    }
}

export async function cleanupFakeMediaDevices() {
    try {
        await runScript(`${process.env.PWD}/recording_scripts/clear-fake-microphone.sh`);
    } catch (err) {
        console.error(err);
    }
}