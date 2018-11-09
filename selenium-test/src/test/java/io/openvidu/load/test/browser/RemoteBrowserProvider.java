/*
 * (C) Copyright 2017-2018 OpenVidu (https://openvidu.io/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

package io.openvidu.load.test.browser;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.ListIterator;
import java.util.Map;
import java.util.Map.Entry;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.openqa.selenium.remote.UnreachableBrowserException;
import org.slf4j.Logger;

import com.google.gson.JsonObject;

import io.openvidu.load.test.AmazonInstance;
import io.openvidu.load.test.OpenViduLoadTest;
import io.openvidu.load.test.utils.BrowserRecordingManager;
import io.openvidu.load.test.utils.ScpFileDownloader;
import io.openvidu.load.test.utils.ScriptExecutor;

/**
 * Manages remote browsers in EC2 Amazon Web Services machines
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class RemoteBrowserProvider implements BrowserProvider {

	class RemoteWebDriverCallable implements Callable<Browser> {

		String instanceID;
		String instanceIP;
		String sessionId;
		String userId;
		boolean isRecorded;
		DesiredCapabilities capabilities;
		int timeOfWaitInSeconds;

		public RemoteWebDriverCallable(String instanceID, String instanceIP, String sessionId, String userId,
				boolean isRecorded, DesiredCapabilities capabilities, int timeOfWaitInSeconds) {
			this.instanceID = instanceID;
			this.instanceIP = instanceIP;
			this.sessionId = sessionId;
			this.userId = userId;
			this.isRecorded = isRecorded;
			this.capabilities = capabilities;
			this.timeOfWaitInSeconds = timeOfWaitInSeconds;
		}

		@Override
		public Browser call() throws Exception {
			Browser returnedBrowser;
			String browserUrl = "http://" + instanceIP + URL_END;
			log.info("Connecting to browser {}", browserUrl);
			WebDriver driver = null;
			int tries = 0;
			boolean browserReady = false;

			// Log connecting to remote web driver event
			JsonObject connectingToBrowserEvent = new JsonObject();
			connectingToBrowserEvent.addProperty("name", "connectingToBrowser");
			connectingToBrowserEvent.addProperty("sessionId", sessionId);
			connectingToBrowserEvent.addProperty("userId", userId);
			connectingToBrowserEvent.addProperty("secondsSinceTestStarted",
					(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
			OpenViduLoadTest.logHelper.logTestEvent(connectingToBrowserEvent);

			while (!browserReady && tries < (SECONDS_OF_BROWSER_WAIT * 1000 / SLEEP_INTERVAL_OF_WAIT)) {
				try {
					driver = new RemoteWebDriver(new URL(browserUrl), capabilities);

					// Log connected to remote web driver event
					JsonObject connectedToBrowserEvent = new JsonObject();
					connectedToBrowserEvent.addProperty("name", "connectedToBrowser");
					connectedToBrowserEvent.addProperty("sessionId", sessionId);
					connectedToBrowserEvent.addProperty("userId", userId);
					connectedToBrowserEvent.addProperty("secondsSinceTestStarted",
							(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
					OpenViduLoadTest.logHelper.logTestEvent(connectedToBrowserEvent);

					browserReady = true;
				} catch (UnreachableBrowserException | MalformedURLException e) {
					log.info("Waiting for browser. Exception caught: {} ({})", e.getClass());
					tries++;
					try {
						Thread.sleep(SLEEP_INTERVAL_OF_WAIT);
					} catch (InterruptedException e1) {
						e1.printStackTrace();
					}
				}
			}
			if (driver != null) {
				returnedBrowser = new ChromeBrowser(sessionId, userId, isRecorded, timeOfWaitInSeconds, driver);
				return returnedBrowser;
			} else {
				throw new BrowserNotReadyException(
						"The browser wasn't reachable in " + SECONDS_OF_BROWSER_WAIT + " seconds");
			}
		}
	}

	final static Logger log = getLogger(lookup().lookupClass());

	Map<String, AmazonInstance> instanceIdInstance = new ConcurrentHashMap<>();
	Map<String, AmazonInstance> userIdInstance = new ConcurrentHashMap<>();
	ScriptExecutor scriptExecutor = new ScriptExecutor();

	final String URL_END = ":4444/wd/hub";
	final int SECONDS_OF_BROWSER_WAIT = 60;
	final int SLEEP_INTERVAL_OF_WAIT = 400;
	public final static String PATH_TO_RECORDING = "/home/ubuntu/recordings";
	public final static String RECORDING_NAME = "recording-";

	@Override
	public Browser getBrowser(String browserType, String sessionId, String userId, boolean isRecorded,
			int timeOfWaitInSeconds) throws BrowserNotReadyException {

		Map<String, AmazonInstance> map = this.scriptExecutor.launchBrowsers(1);
		Browser browser = null;
		DesiredCapabilities capabilities;

		switch (browserType) {
		case "chrome":
			ChromeOptions options = ChromeBrowser.generateFakeVideoChromeOptions("/opt/openvidu/fakevideo.y4m",
					"/opt/openvidu/fakeaudio.wav");
			capabilities = DesiredCapabilities.chrome();
			capabilities.setAcceptInsecureCerts(true);
			capabilities.setCapability(ChromeOptions.CAPABILITY, options);

			for (Entry<String, AmazonInstance> entry : map.entrySet()) {
				final String instanceID = entry.getKey();
				final String instanceIP = map.get(entry.getKey()).getIp();
				if (this.instanceIdInstance.putIfAbsent(instanceID, map.get(instanceID)) == null) {
					// New instance id
					this.userIdInstance.putIfAbsent(userId, map.get(instanceID));
					try {
						Future<Browser> future = OpenViduLoadTest.browserInitializationTaskExecutor
								.submit(new RemoteWebDriverCallable(instanceID, instanceIP, sessionId, userId,
										isRecorded, capabilities, timeOfWaitInSeconds));
						browser = future.get();
						break;
					} catch (InterruptedException | ExecutionException e1) {
						throw new BrowserNotReadyException(
								"The browser wasn't reachabled in " + SECONDS_OF_BROWSER_WAIT + " seconds");
					}
				}
			}
			log.info("Using remote Chrome web driver");
			break;
		default:
			return this.getBrowser("chrome", sessionId, userId, isRecorded, timeOfWaitInSeconds);
		}
		if (browser != null) {
			if (browser.isRecorded()) {
				try {
					BrowserRecordingManager rManager = new BrowserRecordingManager(
							userIdInstance.get(browser.getUserId()), browser.getUserId());
					browser.configureRecordingManager(rManager);
					rManager.startRecording();
				} catch (Exception e) {
					log.error("Error when recording browser {}" + browser.getUserId());
				}
			}
			return browser;
		} else {
			throw new BrowserNotReadyException("There wasn't any browser avaiable according to aws-cli");
		}
	}

	@Override
	public List<Browser> getBrowsers(int numberOfBrowsers, String browserType, String sessionId, List<String> userIds,
			List<Boolean> areRecorded, int timeOfWaitInSeconds) throws BrowserNotReadyException {

		List<Browser> browsers = new ArrayList<>();
		Map<String, AmazonInstance> map = this.scriptExecutor.launchBrowsers(numberOfBrowsers);

		DesiredCapabilities capabilities;

		switch (browserType) {
		case "chrome":
			ChromeOptions options = ChromeBrowser.generateFakeVideoChromeOptions("/opt/openvidu/fakevideo.y4m",
					"/opt/openvidu/fakeaudio.wav");
			capabilities = DesiredCapabilities.chrome();
			capabilities.setAcceptInsecureCerts(true);
			capabilities.setCapability(ChromeOptions.CAPABILITY, options);

			Collection<Callable<Browser>> threads = new ArrayList<>();
			int numberOfLaunchedBrowsers = 0;
			for (Entry<String, AmazonInstance> entry : map.entrySet()) {
				final String instanceID = entry.getKey();
				final String instanceIP = map.get(entry.getKey()).getIp();
				if (numberOfLaunchedBrowsers < numberOfBrowsers) {
					if (this.instanceIdInstance.putIfAbsent(instanceID, map.get(instanceID)) == null) {
						// This is a new created instance
						this.userIdInstance.putIfAbsent(userIds.get(numberOfLaunchedBrowsers), map.get(instanceID));
						threads.add(new RemoteWebDriverCallable(instanceID, instanceIP, sessionId,
								userIds.get(numberOfLaunchedBrowsers), areRecorded.get(numberOfLaunchedBrowsers),
								capabilities, timeOfWaitInSeconds));
						numberOfLaunchedBrowsers++;
					}
				} else {
					break;
				}
			}
			// Initialize all Remote Web Drivers in parallel

			List<Future<Browser>> futures = null;
			try {
				futures = OpenViduLoadTest.browserInitializationTaskExecutor.invokeAll(threads);
			} catch (InterruptedException e1) {
				throw new BrowserNotReadyException(
						"The browser wasn't reachabled in " + SECONDS_OF_BROWSER_WAIT + " seconds");
			}
			for (Future<Browser> f : futures) {
				try {
					browsers.add(f.get());
				} catch (ExecutionException | InterruptedException e) {
					throw new BrowserNotReadyException(
							"The browser wasn't reachabled in " + SECONDS_OF_BROWSER_WAIT + " seconds");
				}
			}
			log.info("Using remote Chrome web drivers");
			break;
		default:
			return this.getBrowsers(numberOfBrowsers, "chrome", sessionId, userIds, areRecorded, timeOfWaitInSeconds);
		}

		log.info("Starting browsers recording");
		final Map<String, Thread> startRecordingThreads = new HashMap<>();
		for (Browser browser : browsers) {
			if (browser.isRecorded()) {
				startRecordingThreads.put(browser.getUserId(), new Thread(() -> {
					try {
						BrowserRecordingManager rManager = new BrowserRecordingManager(
								userIdInstance.get(browser.getUserId()), browser.getUserId());
						browser.configureRecordingManager(rManager);
						rManager.startRecording();
					} catch (Exception e) {
						log.error("Error when recording browser {}", browser.getUserId());
					}
				}));
			}
		}
		for (Thread t : startRecordingThreads.values()) {
			t.start();
		}
		for (Entry<String, Thread> entry : startRecordingThreads.entrySet()) {
			try {
				entry.getValue().join(10000);
			} catch (InterruptedException e) {
				log.error("Browser {} couldn't start the recording process in 10 seconds", entry.getKey());
				// Cancel recording in browser
				ListIterator<Browser> it = browsers.listIterator();
				boolean found = false;
				Browser failedBrowser;
				while (it.hasNext() && !found) {
					failedBrowser = it.next();
					if (failedBrowser.getUserId().equals(entry.getKey())) {
						failedBrowser.setRecorded(false);
						found = true;
					}
				}
			}
		}

		return browsers;
	}

	@Override
	public void terminateInstances() {
		log.info("Terminating AWS instances");
		if (OpenViduLoadTest.someBrowserIsRecorded()) {
			log.info("Some browsers are supposedly being recorded. Stopping first not recorded instances");

			final Map<String, Thread> stopRecordingThreads = new HashMap<>();

			OpenViduLoadTest.sessionIdsBrowsers.values().forEach(sessionBrowsers -> {
				sessionBrowsers.forEach(browser -> {
					if (!browser.isRecorded()) {

						// Immediately terminate not recorded instances
						String instanceToTerminate = this.userIdInstance.get(browser.getUserId()).getInstanceId();
						log.info("Stopping not recorded instance {} of user {}", instanceToTerminate,
								browser.getUserId());
						this.scriptExecutor.bringDownBrowser(instanceToTerminate);
					} else {

						// Stop recording and download video file asynchronously from recorded instances

						stopRecordingThreads.put(browser.getUserId(), new Thread(() -> {
							if (browser.getRecordingManager() != null) {

								// Stop recording
								browser.getRecordingManager().stopRecording();

								// Download video file
								String instanceIp = this.userIdInstance.get(browser.getUserId()).getIp();
								ScpFileDownloader fileDownloader = new ScpFileDownloader(
										OpenViduLoadTest.SERVER_SSH_USER, instanceIp);
								fileDownloader.downloadFile(RemoteBrowserProvider.PATH_TO_RECORDING,
										RemoteBrowserProvider.RECORDING_NAME + browser.getUserId() + ".mp4",
										OpenViduLoadTest.RESULTS_PATH);

								// Terminate instance
								String instanceToTerminate = this.userIdInstance.get(browser.getUserId())
										.getInstanceId();
								log.info("Stopping recorded instance {} of user {}", instanceToTerminate,
										browser.getUserId());
								this.scriptExecutor.bringDownBrowser(instanceToTerminate);
								log.info("Instance {} of user {} stopped", instanceToTerminate, browser.getUserId());
							} else {
								log.error("No BrowserRecordingManager configured for browser {}", browser.getUserId());
							}
						}));
					}
				});
			});
			for (Thread t : stopRecordingThreads.values()) {
				t.start();
			}
			for (Entry<String, Thread> entry : stopRecordingThreads.entrySet()) {
				try {
					entry.getValue().join(600000); // Wait for 10 minutes
				} catch (InterruptedException e) {
					log.error("Recording of browser {} couldn't be downloaded in 10 minutes", entry.getKey());

					// Terminate instance either way
					String instanceToTerminate = this.userIdInstance.get(entry.getKey()).getInstanceId();
					this.scriptExecutor.bringDownBrowser(instanceToTerminate);
				}
			}
		}

		boolean emptyResponse = false;
		do {
			Map<String, AmazonInstance> aliveInstances = this.scriptExecutor.bringDownAllBrowsers();
			emptyResponse = aliveInstances.isEmpty();
			if (emptyResponse) {
				log.info("All instances are now shutted down");
				break;
			} else {
				try {
					log.info("Instances still alive: {}", aliveInstances.toString());
					Thread.sleep(500);
				} catch (InterruptedException e) {
					e.printStackTrace();
				}
			}
		} while (!emptyResponse);
	}

}
