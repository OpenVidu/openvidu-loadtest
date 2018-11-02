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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
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

import com.google.gson.JsonObject;

import io.github.bonigarcia.SeleniumExtension;
import io.github.bonigarcia.wdm.WebDriverManager;
import io.openvidu.load.test.CustomLatch.AbortedException;
import io.openvidu.load.test.browser.Browser;
import io.openvidu.load.test.browser.BrowserNotReadyException;
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

	public static ExecutorService browserTaskExecutor = Executors
			.newFixedThreadPool(Runtime.getRuntime().availableProcessors());
	ScheduledThreadPoolExecutor statGatheringTaskExecutor = new ScheduledThreadPoolExecutor(
			Runtime.getRuntime().availableProcessors());

	static String OPENVIDU_SECRET = "MY_SECRET";
	static String OPENVIDU_URL = "https://localhost:4443/";
	static String APP_URL = "http://localhost:8080/";
	static int SESSIONS = 10;
	static int USERS_SESSION = 7;
	static int SECONDS_OF_WAIT = 40;
	static int NUMBER_OF_POLLS = 8;
	static int BROWSER_POLL_INTERVAL = 1000;
	static boolean REMOTE = false;
	static boolean BROWSER_INIT_AT_ONCE = false;
	static String RESULTS_PATH = "/opt/openvidu/testload/loadTestStats.txt";

	static BrowserProvider browserProvider;
	static Map<String, Collection<Browser>> sessionIdsBrowsers = new ConcurrentHashMap<>();
	public static Long timeTestStarted;
	static Map<String, Long> timeSessionStarted = new ConcurrentHashMap<>();

	static FileWriter fileWriter;

	static CustomLatch startNewSession;
	static CustomLatch lastRoundCount;
	static AtomicBoolean lastBrowserRound = new AtomicBoolean(false);
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
		startNewSession = new CustomLatch(USERS_SESSION * NUMBER_OF_POLLS);
		lastRoundCount = new CustomLatch(USERS_SESSION * NUMBER_OF_POLLS);

		String filePath = RESULTS_PATH;
		try {
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

		log.info("------------ TEST CONFIGURATION ----------");
		log.info("> OpenVidu URL:          {}", OPENVIDU_URL);
		log.info("> OpenVidu secret:       {}", OPENVIDU_SECRET);
		log.info("> App URL:               {}", APP_URL);
		log.info("> Session limit:         {}", SESSIONS);
		log.info("> Users per session:     {}", USERS_SESSION);
		log.info("> Browsers init at once: {}", BROWSER_INIT_AT_ONCE);
		log.info("> Is remote:             {}", REMOTE);
		log.info("> Results stored under:  {}", filePath);
		log.info("---------------------------------------- ");
	}

	@AfterAll
	static void bringDown() {

		// Log test finished event
		JsonObject testFinishedEvent = new JsonObject();
		testFinishedEvent.addProperty("name", "testFinished");
		testFinishedEvent.addProperty("secondsSinceTestStarted",
				(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
		logTestEvent(testFinishedEvent);

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
		log.info("All browsers are now closed");
		try {
			log.info("Closing results file");
			fileWriter.close();
		} catch (IOException e) {
			log.error("Error closing results file: {}", e.getMessage());
		}
		log.info("Load test finished");
		browserProvider.terminateInstances();
	}

	@Test
	@DisplayName("Load testing")
	void loadTest() throws Exception {
		log.info("Starting load test. Running sessions until limit ({})", SESSIONS);
		log.info("In case of success a total number of {} browsers are expected", SESSIONS * USERS_SESSION);
		log.info("In case of success a total number of {} Publishers and {} Subscribers are expected",
				SESSIONS * USERS_SESSION, SESSIONS * (USERS_SESSION * (USERS_SESSION - 1)));
		timeTestStarted = System.currentTimeMillis();

		// Log test started event
		JsonObject testStartedEvent = new JsonObject();
		testStartedEvent.addProperty("name", "testStarted");
		JsonObject jsonProperties = new JsonObject();
		jsonProperties.addProperty("sessions", SESSIONS);
		jsonProperties.addProperty("usersSession", USERS_SESSION);
		testStartedEvent.add("properties", jsonProperties);
		logTestEvent(testStartedEvent);

		if (BROWSER_INIT_AT_ONCE) {
			this.startSessionAllBrowsersAtOnce(1);
		} else {
			this.startSessionBrowserAfterBrowser(1);
		}
	}

	/**
	 * Each browser initialization is done asynchronously (and the same browser
	 * initialization thread is in charge of running the test)
	 **/

	private void startSessionBrowserAfterBrowser(int index) {
		String sessionId = "session-" + index;
		lastSession = sessionId;
		log.info("Starting session: {}", sessionId);
		final Collection<Runnable> threads = new ArrayList<>();

		for (int user = 1; user <= USERS_SESSION; user++) {
			final String userId = "user-" + index + "-" + user;
			threads.add(() -> {
				try {
					startBrowser(index, userId);
				} catch (TimeoutException e) {
					startNewSession
							.abort("User '" + userId + "' in session '" + sessionId + "' for not receiving enough '"
									+ e.getMessage() + "' events in " + SECONDS_OF_WAIT + " seconds");
				} catch (BrowserNotReadyException e) {
					startNewSession.abort("Browser " + userId + " in session " + sessionId + " was not ready");
				}
			});
		}
		for (Runnable r : threads) {
			browserTaskExecutor.execute(r);
		}
		if (index < SESSIONS) {
			try {
				startNewSession.await();
			} catch (AbortedException e) {
				log.error("Some browser thread did not reach a stable session status: {}", e.getMessage());
				Assert.fail("Session did not reach stable status in timeout: " + e.getMessage());
				return;
			}
			startNewSession = new CustomLatch(USERS_SESSION * NUMBER_OF_POLLS);
			log.info("Stats gathering rounds threshold for session {} reached ({} rounds). Next session scheduled",
					sessionId, NUMBER_OF_POLLS);
			this.startSessionBrowserAfterBrowser(index + 1);
		} else {
			log.info("Session limit succesfully reached ({})", SESSIONS);
			lastBrowserRound.set(true);
			try {
				lastRoundCount.await();
			} catch (AbortedException e) {
				log.error("Some browser thread did not reach a stable session status: {}", e.getMessage());
				Assert.fail("Session did not reach stable status in timeout: " + e.getMessage());
				return;
			}
			log.info("Stats gathering rounds threshold for last session {} reached ({} rounds). Ending test", sessionId,
					NUMBER_OF_POLLS);
			log.info("Terminating browser threads");
			this.statGatheringTaskExecutor.shutdown();
		}
		browserTaskExecutor.shutdown();
		try {
			browserTaskExecutor.awaitTermination(5, TimeUnit.MINUTES);
		} catch (InterruptedException e) {
			log.error("Browser tasks couldn't finish in 5 minutes");
			Assert.fail(e.getMessage());
			return;
		}
	}

	private void startBrowser(int sessionIndex, String userId) throws TimeoutException, BrowserNotReadyException {
		log.info("Starting user: {}", userId);
		browserThread(setupBrowser("chrome", "session-" + sessionIndex, userId));
	}

	private Browser setupBrowser(String browserType, String sessionId, String userId) throws BrowserNotReadyException {
		Browser browser = browserProvider.getBrowser(browserType, sessionId, userId, SECONDS_OF_WAIT);
		browser.getDriver().get(APP_URL + "?publicurl=" + OPENVIDU_URL + "&secret=" + OPENVIDU_SECRET + "&sessionId="
				+ sessionId + "&userId=" + userId);
		browser.getManager().startEventPolling(userId, sessionId);
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

	private void startSessionAllBrowsersAtOnce(int index) {
		String sessionId = "session-" + index;
		lastSession = sessionId;
		log.info("Starting session: {}", sessionId);
		Collection<Runnable> threads = new ArrayList<>();
		try {
			threads = startMultipleBrowsers(index);
		} catch (BrowserNotReadyException e) {
			log.error("Some browser was not ready");
			Assert.fail("Some browser was not ready");
			return;
		}
		for (Runnable r : threads) {
			browserTaskExecutor.execute(r);
		}
		if (index < SESSIONS) {
			try {
				startNewSession.await();
			} catch (AbortedException e) {
				log.error("Some browser thread did not reach a stable session status: {}", e.getMessage());
				Assert.fail(e.getMessage());
				return;
			}
			startNewSession = new CustomLatch(USERS_SESSION * NUMBER_OF_POLLS);
			log.info("Stats gathering rounds threshold for session {} reached ({} rounds). Next session scheduled",
					sessionId, NUMBER_OF_POLLS);
			this.startSessionAllBrowsersAtOnce(index + 1);
		} else {
			log.info("Session limit succesfully reached ({})", SESSIONS);
			lastBrowserRound.set(true);
			try {
				lastRoundCount.await();
			} catch (AbortedException e) {
				log.error("Some browser thread did not reach a stable session status: {}", e.getMessage());
				Assert.fail(e.getMessage());
				return;
			}
			log.info("Stats gathering rounds threshold for last session {} reached ({} rounds). Ending test", sessionId,
					NUMBER_OF_POLLS);
			log.info("Terminating browser threads");
			this.statGatheringTaskExecutor.shutdown();
		}
		browserTaskExecutor.shutdown();
		try {
			browserTaskExecutor.awaitTermination(5, TimeUnit.MINUTES);
		} catch (InterruptedException e) {
			log.error("Browser tasks couldn't finish in 5 minutes");
			Assert.fail(e.getMessage());
			return;
		}
	}

	private Collection<Runnable> startMultipleBrowsers(int sessionIndex) throws BrowserNotReadyException {
		List<String> userIds = new ArrayList<>();
		for (int i = 1; i <= USERS_SESSION; i++) {
			userIds.add("user-" + sessionIndex + "-" + i);
		}
		log.info("Starting users: {}", userIds.toString());

		List<Browser> browsers = setupBrowsers(USERS_SESSION, "chrome", "session-" + sessionIndex, userIds);
		final Collection<Runnable> browserThreads = new ArrayList<>();
		for (Browser b : browsers) {
			browserThreads.add(() -> {
				try {
					browserThread(b);
				} catch (TimeoutException e) {
					startNewSession.abort("User '" + b.getUserId() + "' in session '" + b.getSessionId()
							+ "' for not receiving enough '" + e.getMessage() + "' events in " + SECONDS_OF_WAIT
							+ " seconds");
				}
			});
		}
		return browserThreads;
	}

	private List<Browser> setupBrowsers(int numberOfBrowsers, String browserType, String sessionId,
			List<String> userIds) throws BrowserNotReadyException {
		List<Browser> listOfBrowsers = browserProvider.getBrowsers(numberOfBrowsers, browserType, sessionId, userIds,
				SECONDS_OF_WAIT);
		int i = 0;
		for (Browser b : listOfBrowsers) {
			b.getDriver().get(APP_URL + "?publicurl=" + OPENVIDU_URL + "&secret=" + OPENVIDU_SECRET + "&sessionId="
					+ sessionId + "&userId=" + userIds.get(i));
			b.getManager().startEventPolling(userIds.get(i), sessionId);
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

	private void browserThread(Browser browser) throws TimeoutException {

		Long timestamp = System.currentTimeMillis();
		if (timeSessionStarted.putIfAbsent(browser.getSessionId(), timestamp) == null) {
			// Log session started event for the first user connecting to each session
			JsonObject sessionStartedEvent = new JsonObject();
			sessionStartedEvent.addProperty("name", "sessionStarted");
			sessionStartedEvent.addProperty("sessionId", browser.getSessionId());
			sessionStartedEvent.addProperty("secondsSinceTestStarted",
					(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
			logTestEvent(sessionStartedEvent, timestamp);
		}

		// Wait until session is stable
		browser.getManager().waitUntilEventReaches("connectionCreated", USERS_SESSION);
		browser.getManager().waitUntilEventReaches("accessAllowed", 1);
		browser.getManager().waitUntilEventReaches("streamCreated", USERS_SESSION);
		browser.getManager().waitUntilEventReaches("streamPlaying", USERS_SESSION);
		browser.getWaiter().until(ExpectedConditions.numberOfElementsToBe(By.tagName("video"), USERS_SESSION));
		Assert.assertTrue(browser.getManager().assertMediaTracks(browser.getDriver().findElements(By.tagName("video")),
				true, true));

		// Log session stable for thread's user
		JsonObject sessionStableEvent = new JsonObject();
		sessionStableEvent.addProperty("name", "sessionStable");
		sessionStableEvent.addProperty("sessionId", browser.getSessionId());
		sessionStableEvent.addProperty("userId", browser.getUserId());
		sessionStableEvent.addProperty("secondsSinceTestStarted",
				(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
		sessionStableEvent.addProperty("secondsSinceSessionStarted",
				(System.currentTimeMillis() - OpenViduLoadTest.timeSessionStarted.get(browser.getSessionId())) / 1000);
		logTestEvent(sessionStableEvent);

		browser.getManager().stopEventPolling();

		log.info(
				"User {} is now seeing a stable session ({}). OpenVidu events polling thread interrupted and starting stats gathering",
				browser.getUserId(), browser.getSessionId());

		// Session stable. Start webrtc stats gathering
		Runnable runnable = new Runnable() {
			int gatheringRoundCount = 1;

			@Override
			public void run() {
				browser.getManager().gatherEventsAndStats(browser.getUserId(), gatheringRoundCount);
				if (browser.getSessionId().equals(lastSession)) {
					startNewSession.succeed();
					if (lastBrowserRound.get()) {
						lastRoundCount.succeed();
					}
				}
				gatheringRoundCount++;
			}
		};
		this.statGatheringTaskExecutor.scheduleAtFixedRate(runnable, 0L, BROWSER_POLL_INTERVAL, TimeUnit.MILLISECONDS);
	}

	private static void gracefullyLeaveParticipant(Browser browser) throws Exception {
		Actions actions = new Actions(browser.getDriver());
		actions.moveToElement(browser.getDriver().findElement(By.id("leave")));
		actions.click();
		actions.build().perform();
		browser.getWaiter().until(ExpectedConditions.numberOfElementsToBe(By.tagName("video"), 0));
	}

	public static void logTestEvent(JsonObject event) {
		JsonObject testEvent = new JsonObject();
		testEvent.add("event", event);
		testEvent.addProperty("timestamp", System.currentTimeMillis());
		OpenViduLoadTest.writeToOutput(testEvent.toString() + System.getProperty("line.separator"));
	}

	public static void logTestEvent(JsonObject event, Long timestamp) {
		JsonObject testEvent = new JsonObject();
		testEvent.add("event", event);
		testEvent.addProperty("timestamp", timestamp);
		OpenViduLoadTest.writeToOutput(testEvent.toString() + System.getProperty("line.separator"));
	}

	public static synchronized void writeToOutput(String s) {
		try {
			OpenViduLoadTest.fileWriter.write(s);
		} catch (IOException e) {
			e.printStackTrace();
		}
	}

}
