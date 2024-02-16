import { isRunning, runScript } from "../utils/run-script";
import { Browser, Builder, Capabilities, WebDriver } from "selenium-webdriver";
import { startFakeMediaDevices } from "../utils/fake-media-devices";
import chrome = require('selenium-webdriver/chrome');
import firefox = require('selenium-webdriver/firefox');
import fs = require('fs');

let driver;
if (process.env.REAL_DRIVER === "firefox") {
    driver = firefox;
} else {
    driver = chrome;
}

export class SeleniumService {
    
    private static instance: SeleniumService;
    //TODO: Add this as config
    // private static readonly BROWSER_HOSTPORT = 4444;

    private constructor() {
    }

    static async getInstance(videoPath?: string, audioPath?: string) {
        if (!SeleniumService.instance) {
            if (!(videoPath && audioPath)) {
                throw new Error("Video and audio are needed for initializing Selenium")
            }
            // Start X server for browsers, assumes Xvfb installed and DISPLAY :10 free
            // TODO: choose display number in config
            process.env.DISPLAY=":10"
            if (!await isRunning("Xvfb :10")) {
                await runScript(`Xvfb ${process.env.DISPLAY} -screen 0 1920x1080x24 -ac`, {
                    detached: true,
                    ignoreLogs: true
                });
            }
            // Start fake webcam for media capture
            await startFakeMediaDevices(videoPath, audioPath);
            // Start selenium
            SeleniumService.instance = new SeleniumService();
        }
        return SeleniumService.instance;
    }

    async getChromeDriver(chromeCapabilities: Capabilities, chromeOptions: chrome.Options): Promise<WebDriver> {
        const sb = new chrome.ServiceBuilder().enableVerboseLogging().loggingTo(`${process.cwd()}/selenium.log`);
		return await new Builder()
			.forBrowser(Browser.CHROME)
			.withCapabilities(chromeCapabilities)
			.setChromeOptions(chromeOptions)
            .setChromeService(sb)
			.build();
	}

    async getFirefoxDriver(firefoxCapabilities: Capabilities, firefoxOptions: firefox.Options): Promise<WebDriver> {
        // const logFile = `${process.cwd()}/selenium.log`;
        // const logStream = fs.createWriteStream(logFile, {flags: 'a'});
        //process.env.MOZ_LOG = "RTCRtpSender:5,VideoEngine:5,RTCDMTFSender:5,CamerasParent:5,WebrtcTCPSocket:5,MediaTrackGraph:5,WebAudioAPI:5,HTMLMediaElement:5,MediaEncoder:5,ForwardedInputTrack:5,HTMLMediaElementEvents:5,GetUserMedia:5,CamerasChild:5,VP8TrackEncoder:5,MediaChild:5,MediaPipeline:5,TabShare:5,VideoFrameConverter:5,sdp:5,mtransport:5,ShmemPool:5,webrtc_trace:5,signaling:5,MediaManager:5,DriftCompensator:5,jsep:5,ForwardInputTrack:5,RTCRtpReceiver:5,cubeb:5,TrackEncoder:5,PeerConnectionImpl:5,MediaParent:5,RTCRtpTransceiver:5,MediaRecorder:5,Muxer:5,MediaStreamTrack:5,MediaStream:5"
        // process.env.MOZ_LOG = "MediaRecorder:5,MediaStream:5,MediaEncoder:5,MediaDecoder:5,MediaTimer:5,MediaTrackGraph:5,"
        const sb = new firefox.ServiceBuilder().enableVerboseLogging(true).setStdio('inherit');
		return await new Builder()
			.forBrowser(Browser.FIREFOX)
			.withCapabilities(firefoxCapabilities)
			.setFirefoxOptions(firefoxOptions)
            .setFirefoxService(sb)
			.build();
    }
}