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
import static org.openqa.selenium.OutputType.BASE64;
import static org.slf4j.LoggerFactory.getLogger;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.Assert;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.platform.runner.JUnitPlatform;
import org.junit.runner.RunWith;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.TakesScreenshot;
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
@Tag("Load test")
@DisplayName("OpenVidu load test")
@ExtendWith(SeleniumExtension.class)
@RunWith(JUnitPlatform.class)
public class OpenViduLoadTest {

	final static Logger log = getLogger(lookup().lookupClass());

	static String OPENVIDU_SECRET = "MY_SECRET";
	static String OPENVIDU_URL = "https://localhost:4443/";
	static String APP_URL = "http://localhost:8080/";
	static int SESSIONS = 20;
	static int USERS_SESSION = 7;
	static int SECONDS_OF_WAIT = 40;
	static int BROWSER_LAUNCH_INTERVAL = 2000;
	static int BROWSER_POLL_INTERVAL = 500;
	static boolean REMOTE = false;

	static BrowserProvider browserProvider;
	static Map<String, Collection<Browser>> sessionIdsBrowsers = new ConcurrentHashMap<>();

	@BeforeAll()
	static void setup() {
		WebDriverManager.chromedriver().setup();

		String openviduUrl = System.getProperty("OPENVIDU_URL");
		String openviduSecret = System.getProperty("OPENVIDU_SECRET");
		String appUrl = System.getProperty("APP_URL");
		String sessions = System.getProperty("SESSIONS");
		String usersSession = System.getProperty("USERS_SESSION");
		String secondsOfWait = System.getProperty("SECONDS_OF_WAIT");
		String browserLaunchInterval = System.getProperty("BROWSER_LAUNCH_INTERVAL");
		String browserPollInterval = System.getProperty("BROWSER_POLL_INTERVAL");
		String remote = System.getProperty("REMOTE");

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
		if (browserLaunchInterval != null) {
			BROWSER_LAUNCH_INTERVAL = Integer.parseInt(browserLaunchInterval);
		}
		if (browserPollInterval != null) {
			BROWSER_POLL_INTERVAL = Integer.parseInt(browserPollInterval);
		}
		if (remote != null) {
			REMOTE = Boolean.parseBoolean(remote);
		}
		browserProvider = REMOTE ? new RemoteBrowserProvider() : new LocalBrowserProvider();

		log.info("OpenVidu URL: {}", OPENVIDU_URL);
		log.info("OpenVidu secret: {}", OPENVIDU_SECRET);
		log.info("App URL: {}", APP_URL);
		log.info("Sessions: {}", SESSIONS);
		log.info("Is remote: {}", REMOTE);
	}

	@AfterAll
	static void bringDown() {
		sessionIdsBrowsers.entrySet().forEach(entry -> {
			entry.getValue().forEach(browser -> {
				browser.dispose();
			});
		});
	}

	Browser setupBrowser(String browserType, String sessionId, String userId) {
		Browser browser = browserProvider.getBrowser(browserType, userId, SECONDS_OF_WAIT);
		browser.getDriver().get(APP_URL + "?publicurl=" + OPENVIDU_URL + "&secret=" + OPENVIDU_SECRET + "&sessionId="
				+ sessionId + "&userId=" + userId);
		browser.getEventManager().startPolling();
		Collection<Browser> browsers = sessionIdsBrowsers.putIfAbsent(sessionId, new ArrayList<>());
		if (browsers != null) {
			browsers.add(browser);
		} else {
			sessionIdsBrowsers.get(sessionId).add(browser);
		}
		return browser;
	}

	@Test
	@DisplayName("Load testing")
	void loadTest() throws Exception {
		log.info("> Starting load test. Running sessions until limit: {}", SESSIONS);
		this.startSession(1);
	}

	private void startSession(int index) throws Exception {
		String sessionId = "session-" + index;
		log.info("> Starting session: {}", sessionId);
		final int[] userIndexArray = { 1 };
		final List<Thread> threads = new ArrayList<>();
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
			this.startSession(index + 1);
		}
	}

	private void startBrowser(int sessionIndex, int userIndex) throws Exception {
		String userId = "user-" + sessionIndex + "-" + userIndex;
		log.info("    > Starting user: {}", userId);
		Browser browser = setupBrowser("chrome", "session-" + sessionIndex, userId);
		browser.getEventManager().waitUntilEventReaches("connectionCreated", USERS_SESSION);
		browser.getEventManager().waitUntilEventReaches("accessAllowed", 1);
		browser.getEventManager().waitUntilEventReaches("streamCreated", USERS_SESSION);
		browser.getEventManager().waitUntilEventReaches("streamPlaying", USERS_SESSION);
		browser.getWaiter().until(ExpectedConditions.numberOfElementsToBe(By.tagName("video"), USERS_SESSION));
		Assert.assertTrue(browser.getEventManager()
				.assertMediaTracks(browser.getDriver().findElements(By.tagName("video")), true, true));
	}

	private String getBase64Screenshot(Browser browser) throws Exception {
		String screenshotBase64 = ((TakesScreenshot) browser.getDriver()).getScreenshotAs(BASE64);
		return "data:image/png;base64," + screenshotBase64;
	}

	private void gracefullyLeaveParticipant(Browser browser) throws Exception {
		browser.getDriver().findElement(By.id("leave")).sendKeys(Keys.ENTER);
		browser.getEventManager().waitUntilEventReaches("sessionDisconnected", 1);
	}

}
