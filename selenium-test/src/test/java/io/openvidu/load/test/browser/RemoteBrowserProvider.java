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
import java.util.HashMap;
import java.util.Iterator;
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
import com.jcraft.jsch.JSchException;

import io.openvidu.load.test.AmazonInstance;
import io.openvidu.load.test.OpenViduLoadTest;
import io.openvidu.load.test.utils.BrowserSshManager;
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
		BrowserProperties properties;
		DesiredCapabilities capabilities;

		public RemoteWebDriverCallable(String instanceID, String instanceIP, BrowserProperties properties,
				DesiredCapabilities capabilities) {
			this.instanceID = instanceID;
			this.instanceIP = instanceIP;
			this.properties = properties;
			this.capabilities = capabilities;
		}

		@Override
		public Browser call() throws Exception {
			Browser returnedBrowser = null;
			String browserUrl = "http://" + instanceIP + URL_END;
			log.info("Connecting to browser {}", browserUrl);
			WebDriver driver = null;
			int tries = 0;
			boolean browserReady = false;

			// Log connecting to remote web driver event
			JsonObject connectingToBrowserEvent = new JsonObject();
			connectingToBrowserEvent.addProperty("name", "connectingToBrowser");
			connectingToBrowserEvent.addProperty("sessionId", properties.sessionId());
			connectingToBrowserEvent.addProperty("userId", properties.userId());
			connectingToBrowserEvent.addProperty("secondsSinceTestStarted",
					(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
			OpenViduLoadTest.logHelper.logTestEvent(connectingToBrowserEvent);

			while (!browserReady && tries < (SECONDS_OF_BROWSER_WAIT * 1000 / SLEEP_INTERVAL_OF_WAIT)) {
				try {
					driver = new RemoteWebDriver(new URL(browserUrl), capabilities);

					// Log connected to remote web driver event
					JsonObject connectedToBrowserEvent = new JsonObject();
					connectedToBrowserEvent.addProperty("name", "connectedToBrowser");
					connectedToBrowserEvent.addProperty("sessionId", properties.sessionId());
					connectedToBrowserEvent.addProperty("userId", properties.userId());
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
				switch (properties.type()) {
				case "chrome":
					returnedBrowser = new ChromeBrowser(properties, driver);
					break;
				}
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
	public Browser getBrowser(BrowserProperties properties) throws BrowserNotReadyException {

		Map<String, AmazonInstance> map = this.scriptExecutor.launchBrowsers(1);
		Browser browser = null;
		DesiredCapabilities capabilities;

		switch (properties.type()) {
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
					this.userIdInstance.putIfAbsent(properties.userId(), map.get(instanceID));
					try {
						Future<Browser> future = OpenViduLoadTest.browserInitializationTaskExecutor
								.submit(new RemoteWebDriverCallable(instanceID, instanceIP, properties, capabilities));
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
		}

		if (browser != null) {

			// Establish SSH connection
			try {
				BrowserSshManager sshManager = new BrowserSshManager(userIdInstance.get(browser.getUserId()),
						browser.getBrowserProperties());
				browser.configureSshManager(sshManager);
			} catch (JSchException e) {
				log.error("Couldn't connect through ssh in 10 seconds to browser {}", browser.getUserId());
			}

			// Networking process (only if different to ALL_OPEN)
			if (!browser.networkRestriction().equals(NetworkRestriction.ALL_OPEN)) {
				try {
					browser.getSshManager().updateNetworkingRestrictions(browser.networkRestriction());
				} catch (Exception e) {
					log.error("Error when configuring network conditions in browser {}" + browser.getUserId());
				}
			}

			// Recording process
			if (browser.isRecorded()) {
				try {
					browser.getSshManager().startRecording();
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
	public List<Browser> getBrowsers(List<BrowserProperties> properties) throws BrowserNotReadyException {

		Map<String, AmazonInstance> map = this.scriptExecutor.launchBrowsers(properties.size());
		Iterator<BrowserProperties> iterator = properties.iterator();

		List<Browser> browsers = new ArrayList<>();
		List<Callable<Browser>> threads = new ArrayList<>();
		List<DesiredCapabilities> capabilities = new ArrayList<>();

		while (iterator.hasNext()) {
			BrowserProperties props = iterator.next();
			DesiredCapabilities caps;
			switch (props.type()) {
			case "chrome":
				ChromeOptions options = ChromeBrowser.generateFakeVideoChromeOptions("/opt/openvidu/fakevideo.y4m",
						"/opt/openvidu/fakeaudio.wav");
				caps = DesiredCapabilities.chrome();
				caps.setAcceptInsecureCerts(true);
				caps.setCapability(ChromeOptions.CAPABILITY, options);
				capabilities.add(caps);

				break;
			}
		}

		int numberOfLaunchedBrowsers = 0;
		for (Entry<String, AmazonInstance> entry : map.entrySet()) {
			final String instanceID = entry.getKey();
			final String instanceIP = map.get(entry.getKey()).getIp();
			if (numberOfLaunchedBrowsers < properties.size()) {
				if (this.instanceIdInstance.putIfAbsent(instanceID, map.get(instanceID)) == null) {
					// This is a new created instance
					this.userIdInstance.putIfAbsent(properties.get(numberOfLaunchedBrowsers).userId(),
							map.get(instanceID));
					threads.add(new RemoteWebDriverCallable(instanceID, instanceIP,
							properties.get(numberOfLaunchedBrowsers), capabilities.get(numberOfLaunchedBrowsers)));
					numberOfLaunchedBrowsers++;
				}
			} else {
				// Instance already allocated. Simply skip it
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

		log.info("All remote web drivers for session {} are initialized", properties.get(0).sessionId());

		// Browser recording and network configuration
		final Map<String, Thread> networkRestrictionThreads = new HashMap<>();
		final Map<String, Thread> startRecordingThreads = new HashMap<>();
		for (Browser browser : browsers) {

			// Networking process (only if different to ALL_OPEN)
			if (!browser.networkRestriction().equals(NetworkRestriction.ALL_OPEN)) {
				networkRestrictionThreads.put(browser.getUserId(), new Thread(() -> {
					try {
						if (browser.getSshManager() == null) {
							BrowserSshManager sshManager = new BrowserSshManager(
									userIdInstance.get(browser.getUserId()), browser.getBrowserProperties());
							browser.configureSshManager(sshManager);
						}
						browser.getSshManager().updateNetworkingRestrictions(browser.networkRestriction());
					} catch (Exception e) {
						log.error("Error when configuring network conditions in browser {}" + browser.getUserId());
					}
				}));
			}

			// Recording process (only if browser is set to be recorded)
			if (browser.isRecorded()) {
				startRecordingThreads.put(browser.getUserId(), new Thread(() -> {
					try {
						if (browser.getSshManager() == null) {
							BrowserSshManager sshManager = new BrowserSshManager(
									userIdInstance.get(browser.getUserId()), browser.getBrowserProperties());
							browser.configureSshManager(sshManager);
						}
						browser.getSshManager().startRecording();
					} catch (Exception e) {
						log.error("Error when recording browser {}" + browser.getUserId());
					}
				}));
			}
		}

		// Async setup every instance network restriction and wait for all of them
		for (Thread t : networkRestrictionThreads.values()) {
			t.start();
		}
		for (Entry<String, Thread> entry : networkRestrictionThreads.entrySet()) {
			try {
				entry.getValue().join(10000);
			} catch (InterruptedException e) {
				log.error("Browser {} couldn't setup network restrictions 10 seconds", entry.getKey());
			}
		}

		log.info("All network restrictions for session {} are now applied", properties.get(0).sessionId());

		// Async start every browser recording and wait for all of them
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

		log.info("All recordings for session {} are now started", properties.get(0).sessionId());

		return browsers;
	}

	@Override
	public void terminateInstances() {
		log.info("Terminating AWS instances");
		if (OpenViduLoadTest.someBrowserIsRecorded()) {
			log.info("Some browsers are supposedly being recorded. Stopping first not recorded instances");

			final Map<String, Thread> stopNotRecordedBrowsersThreads = new HashMap<>();
			final Map<String, Thread> stopRecordedBrowsersThreads = new HashMap<>();

			OpenViduLoadTest.sessionIdsBrowsers.values().forEach(sessionBrowsers -> {
				sessionBrowsers.forEach(browser -> {
					if (!browser.isRecorded()) {

						// Immediately terminate not recorded instances

						final String instanceToTerminate = this.userIdInstance.get(browser.getUserId()).getInstanceId();
						stopNotRecordedBrowsersThreads.put(browser.getUserId(), new Thread(() -> {
							log.info("Stopping not recorded instance {} of user {}", instanceToTerminate,
									browser.getUserId());
							this.scriptExecutor.bringDownBrowser(instanceToTerminate);
							log.info("Not recorded instance {} of user {} succcessfully terminated",
									instanceToTerminate, browser.getUserId());
						}));
					} else {

						// Stop recording and download video file asynchronously from recorded instances

						stopRecordedBrowsersThreads.put(browser.getUserId(), new Thread(() -> {
							if (browser.getSshManager() != null) {

								// Stop recording
								browser.getSshManager().stopRecording();

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
								log.info("Recorded instance {} of user {} succcessfully terminated",
										instanceToTerminate, browser.getUserId());
							} else {
								log.error("No BrowserRecordingManager configured for browser {}", browser.getUserId());
							}
						}));
					}
				});
			});

			for (Thread t : stopNotRecordedBrowsersThreads.values()) {
				t.start();
			}
			for (Entry<String, Thread> entry : stopNotRecordedBrowsersThreads.entrySet()) {
				try {
					entry.getValue().join(60000); // Wait for 1 minute
				} catch (InterruptedException e) {
					log.error("Not recorded browser {} couldn't be stopped in 1 minute", entry.getKey());
				}
			}

			log.info("All NOT recorded instances are now terminated");

			for (Thread t : stopRecordedBrowsersThreads.values()) {
				t.start();
			}
			for (Entry<String, Thread> entry : stopRecordedBrowsersThreads.entrySet()) {
				try {
					entry.getValue().join(600000); // Wait for 10 minutes
				} catch (InterruptedException e) {
					log.error("Recording of browser {} couldn't be downloaded in 10 minutes", entry.getKey());

					// Terminate instance either way
					String instanceToTerminate = this.userIdInstance.get(entry.getKey()).getInstanceId();
					this.scriptExecutor.bringDownBrowser(instanceToTerminate);
				}
			}

			log.info("All recorded instances are now terminated");
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
