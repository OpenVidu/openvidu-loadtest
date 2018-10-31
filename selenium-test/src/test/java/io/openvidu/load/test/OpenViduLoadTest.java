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

package io.openvidu.load.test;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.Assert;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.platform.runner.JUnitPlatform;
import org.junit.runner.RunWith;
import org.openqa.selenium.By;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.slf4j.Logger;

import io.github.bonigarcia.SeleniumExtension;
import io.github.bonigarcia.wdm.WebDriverManager;
import io.openvidu.load.test.browser.Browser;
import io.openvidu.load.test.browser.BrowserProvider;
import io.openvidu.load.test.browser.LocalBrowserProvider;
import io.openvidu.load.test.browser.RemoteBrowserProvider;

/**
 * E2E test for OpenVidu load testing
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
@DisplayName("OpenVidu load test")
@ExtendWith(SeleniumExtension.class)
@RunWith(JUnitPlatform.class)
public class OpenViduLoadTest {

	final static Logger log = getLogger(lookup().lookupClass());

	static String OPENVIDU_SECRET = "MY_SECRET";
	static String OPENVIDU_URL = "https://localhost:4443/";
	static String APP_URL = "http://localhost:8080/";
	static int SESSIONS = 10;
	static int USERS_SESSION = 7;
	static int SECONDS_OF_WAIT = 40;
	static int NUMBER_OF_POLLS = 8;
	static int BROWSER_POLL_INTERVAL = 1000;
	static int BROWSER_LAUNCH_INTERVAL = 2000;
	static boolean REMOTE = false;
	static boolean BROWSER_INIT_AT_ONCE = false;
	static String RESULTS_PATH = "/opt/openvidu/testload/loadTestStats.txt";

	static BrowserProvider browserProvider;
	static Map<String, Collection<Browser>> sessionIdsBrowsers = new ConcurrentHashMap<>();
	static Long timeTestStarted;
	static Map<String, Long> timeSessionStarted = new ConcurrentHashMap<>();

	static FileWriter fileWriter;

	static CountDownLatch startNewSession = new CountDownLatch(USERS_SESSION);
	static AtomicBoolean keepPolling = new AtomicBoolean(true);
	static String lastSession;

	@BeforeAll()
	static void setup() {
		WebDriverManager.chromedriver().setup();

		String openviduUrl = System.getProperty("OPENVIDU_URL");
		String openviduSecret = System.getProperty("OPENVIDU_SECRET");
		String appUrl = System.getProperty("APP_URL");
		String sessions = System.getProperty("SESSIONS");
		String usersSession = System.getProperty("USERS_SESSION");
		String secondsOfWait = System.getProperty("SECONDS_OF_WAIT");
		String numberOfPolls = System.getProperty("NUMBER_OF_POLLS");
		String browserLaunchInterval = System.getProperty("BROWSER_LAUNCH_INTERVAL");
		String browserPollInterval = System.getProperty("BROWSER_POLL_INTERVAL");
		String remote = System.getProperty("REMOTE");
		String browserInitAtOnce = System.getProperty("BROWSER_INIT_AT_ONCE");
		String resultsPath = System.getProperty("RESULTS_PATH");

		if (openviduUrl != null) {
			OPENVIDU_URL = openviduUrl;
		}
		if (openviduSecret != null) {
			OPENVIDU_SECRET = openviduSecret;
		}
		if (appUrl != null) {
			APP_URL = appUrl;
		}
		if (sessions != null) {
			SESSIONS = Integer.parseInt(sessions);
		}
		if (usersSession != null) {
			USERS_SESSION = Integer.parseInt(usersSession);
		}
		if (secondsOfWait != null) {
			SECONDS_OF_WAIT = Integer.parseInt(secondsOfWait);
		}
		if (numberOfPolls != null) {
			NUMBER_OF_POLLS = Integer.parseInt(numberOfPolls);
		}
		if (browserLaunchInterval != null) {
			BROWSER_LAUNCH_INTERVAL = Integer.parseInt(browserLaunchInterval);
		}
		if (browserPollInterval != null) {
			BROWSER_POLL_INTERVAL = Integer.parseInt(browserPollInterval);
		}
		if (remote != null) {
			REMOTE = Boolean.parseBoolean(remote);
		}
		if (browserInitAtOnce != null) {
			BROWSER_INIT_AT_ONCE = Boolean.parseBoolean(browserInitAtOnce);
		}
		if (resultsPath != null) {
			RESULTS_PATH = resultsPath;
		}
		browserProvider = REMOTE ? new RemoteBrowserProvider() : new LocalBrowserProvider();

		log.info("OpenVidu URL: {}", OPENVIDU_URL);
		log.info("OpenVidu secret: {}", OPENVIDU_SECRET);
		log.info("App URL: {}", APP_URL);
		log.info("Sessions: {}", SESSIONS);
		log.info("Is remote: {}", REMOTE);

		try {
			String filePath = RESULTS_PATH;
			boolean alreadyExists = new File(filePath).exists();
			int fileIndex = 1;
			while (alreadyExists) {
				filePath = RESULTS_PATH.substring(0, RESULTS_PATH.length() - 4) + "-" + fileIndex + ".txt";
				alreadyExists = new File(filePath).exists();
				fileIndex++;
			}
			fileWriter = new FileWriter(filePath, true);
		} catch (IOException e) {
			log.error("Stats output file couldn't be opened: {}", e.toString());
		}
	}

	@AfterAll
	static void bringDown() {
		sessionIdsBrowsers.entrySet().forEach(entry -> {
			entry.getValue().forEach(browser -> {
				try {
					log.info("Leaving participant {} from session {}", browser.getUserId(), browser.getSessionId());
					gracefullyLeaveParticipant(browser);
				} catch (Exception e) {
					e.printStackTrace();
				}
				browser.dispose();
			});
		});
		try {
			fileWriter.close();
		} catch (IOException e) {
			e.printStackTrace();
		}
	}

	@Test
	@DisplayName("Load testing")
	void loadTest() throws Exception {
		log.info("Starting load test. Running sessions until limit: {}", SESSIONS);
		timeTestStarted = System.currentTimeMillis();
		if (BROWSER_INIT_AT_ONCE) {
			this.startSessionAllBrowsersAtOnce(1);
		} else {
			this.startSessionBrowserAfterBrowser(1);
		}
	}

	/**
	 * Each browser initialization is done asynchronously (and the same setup thread
	 * is in charge of running the test)
	 **/

	private void startSessionBrowserAfterBrowser(int index) throws Exception {
		String sessionId = "session-" + index;
		lastSession = sessionId;
		log.info("Starting session: {}", sessionId);
		final int[] userIndexArray = { 1 };
		final List<Thread> threads = new ArrayList<>();
		timeSessionStarted.put(sessionId, System.currentTimeMillis());
		for (int user = 1; user <= USERS_SESSION; user++) {
			userIndexArray[0] = user;
			Thread t = new Thread(() -> {
				try {
					startBrowser(index, userIndexArray[0]);
				} catch (Exception e) {
					e.printStackTrace();
				}
			});
			t.start();
			threads.add(t);
			Thread.sleep(BROWSER_LAUNCH_INTERVAL);
		}
		for (int i = 0; i < threads.size(); i++) {
			threads.get(i).join();
		}
		if (index < SESSIONS) {
			this.startSessionBrowserAfterBrowser(index + 1);
		}
	}

	private void startBrowser(int sessionIndex, int userIndex) throws Exception {
		String userId = "user-" + sessionIndex + "-" + userIndex;
		log.info("Starting user: {}", userId);
		browserThread(setupBrowser("chrome", "session-" + sessionIndex, userId));
	}

	private Browser setupBrowser(String browserType, String sessionId, String userId) {
		Browser browser = browserProvider.getBrowser(browserType, sessionId, userId, SECONDS_OF_WAIT);
		browser.getDriver().get(APP_URL + "?publicurl=" + OPENVIDU_URL + "&secret=" + OPENVIDU_SECRET + "&sessionId="
				+ sessionId + "&userId=" + userId);
		browser.getEventManager().startEventPolling();
		Collection<Browser> browsers = sessionIdsBrowsers.putIfAbsent(sessionId, new ArrayList<>());
		if (browsers != null) {
			browsers.add(browser);
		} else {
			sessionIdsBrowsers.get(sessionId).add(browser);
		}
		return browser;
	}

	/**
	 * All browsers initialization are done before running same asynchronous test in
	 * each one of them
	 **/

	private void startSessionAllBrowsersAtOnce(int index) throws Exception {
		String sessionId = "session-" + index;
		lastSession = sessionId;
		log.info("Starting session: {}", sessionId);
		timeSessionStarted.put(sessionId, System.currentTimeMillis());
		List<Thread> browserThreads = startMultipleBrowsers(index);
		if (index < SESSIONS) {
			startNewSession.await();
			startNewSession = new CountDownLatch(USERS_SESSION);
			this.startSessionAllBrowsersAtOnce(index + 1);
		} else {
			log.info("Session limit succesfully reached ({})", SESSIONS);
			keepPolling.set(false);
		}
		for (int i = 0; i < browserThreads.size(); i++) {
			browserThreads.get(i).join();
		}
	}

	private List<Thread> startMultipleBrowsers(int sessionIndex) throws Exception {
		List<String> userIds = new ArrayList<>();
		for (int i = 1; i <= USERS_SESSION; i++) {
			userIds.add("user-" + sessionIndex + "-" + i);
		}
		log.info("Starting users: {}", userIds.toString());

		List<Browser> browsers = setupBrowsers(USERS_SESSION, "chrome", "session-" + sessionIndex, userIds);
		final List<Thread> threads = new ArrayList<>();
		for (Browser b : browsers) {
			Thread t = new Thread(() -> {
				try {
					browserThread(b);
				} catch (Exception e) {
					e.printStackTrace();
				}
			});
			threads.add(t);
		}
		for (Thread t : threads) {
			log.info("Starting browser thread");
			t.start();
		}
		return threads;
	}

	private List<Browser> setupBrowsers(int numberOfBrowsers, String browserType, String sessionId,
			List<String> userIds) {
		List<Browser> listOfBrowsers = browserProvider.getBrowsers(numberOfBrowsers, browserType, sessionId, userIds,
				SECONDS_OF_WAIT);
		int i = 0;
		for (Browser b : listOfBrowsers) {
			b.getDriver().get(APP_URL + "?publicurl=" + OPENVIDU_URL + "&secret=" + OPENVIDU_SECRET + "&sessionId="
					+ sessionId + "&userId=" + userIds.get(i));
			b.getEventManager().startEventPolling();
			Collection<Browser> browsers = sessionIdsBrowsers.putIfAbsent(sessionId, new ArrayList<>());
			if (browsers != null) {
				browsers.add(b);
			} else {
				sessionIdsBrowsers.get(sessionId).add(b);
			}
			i++;
		}
		return listOfBrowsers;
	}

	private void browserThread(Browser browser) throws Exception {
		// Wait until session is stable
		browser.getEventManager().waitUntilEventReaches("connectionCreated", USERS_SESSION);
		browser.getEventManager().waitUntilEventReaches("accessAllowed", 1);
		browser.getEventManager().waitUntilEventReaches("streamCreated", USERS_SESSION);
		browser.getEventManager().waitUntilEventReaches("streamPlaying", USERS_SESSION);
		browser.getWaiter().until(ExpectedConditions.numberOfElementsToBe(By.tagName("video"), USERS_SESSION));
		Assert.assertTrue(browser.getEventManager()
				.assertMediaTracks(browser.getDriver().findElements(By.tagName("video")), true, true));
		browser.getEventManager().stopEventPolling();
		Thread.sleep(2000);

		// Session stable. Start stats gathering
		while (keepPolling.get()) {
			long currentTime = System.currentTimeMillis();
			browser.getEventManager().gatherEventsAndStats();
			long timeElapsed = System.currentTimeMillis() - currentTime;
			if (timeElapsed < BROWSER_POLL_INTERVAL) {
				Thread.sleep(BROWSER_POLL_INTERVAL - timeElapsed);
			}
			if (browser.getSessionId().equals(lastSession)) {
				startNewSession.countDown();
			}
		}
		log.info("Browser thread gracefully finished for user {} in session {}", browser.getUserId(),
				browser.getSessionId());
	}

	private static void gracefullyLeaveParticipant(Browser browser) throws Exception {
		Actions actions = new Actions(browser.getDriver());
		actions.moveToElement(browser.getDriver().findElement(By.id("leave")));
		actions.click();
		actions.build().perform();
		browser.getWaiter().until(ExpectedConditions.numberOfElementsToBe(By.tagName("video"), 0));
	}

}
