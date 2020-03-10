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

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.MalformedURLException;
import java.net.ProtocolException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.IntStream;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

import org.apache.commons.io.FileUtils;
import org.junit.Assert;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.platform.runner.JUnitPlatform;
import org.junit.runner.RunWith;
import org.openqa.selenium.By;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.slf4j.Logger;

import io.github.bonigarcia.wdm.WebDriverManager;
import io.openvidu.load.test.browser.Browser;
import io.openvidu.load.test.browser.BrowserNotReadyException;
import io.openvidu.load.test.browser.BrowserProperties;
import io.openvidu.load.test.browser.BrowserProvider;
import io.openvidu.load.test.browser.LocalBrowserProvider;
import io.openvidu.load.test.browser.NetworkRestriction;
import io.openvidu.load.test.browser.RemoteBrowserProvider;
import io.openvidu.load.test.utils.BrowserSshManager;
import io.openvidu.load.test.utils.CustomLatch;
import io.openvidu.load.test.utils.CustomLatch.AbortedException;
import io.openvidu.load.test.utils.LogHelper;
import io.openvidu.load.test.utils.ZipGenerator;

/**
 * E2E test for OpenVidu load testing
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
@DisplayName("OpenVidu load test")
@RunWith(JUnitPlatform.class)
public class OpenViduLoadTest {

	final static Logger log = getLogger(lookup().lookupClass());

	public static ExecutorService browserInitializationTaskExecutor = Executors.newCachedThreadPool();;
	ScheduledThreadPoolExecutor statGatheringTaskExecutor = new ScheduledThreadPoolExecutor(
			Runtime.getRuntime().availableProcessors() * 4);
	final static ScheduledThreadPoolExecutor tcpdumpStopProcesses = new ScheduledThreadPoolExecutor(
			Runtime.getRuntime().availableProcessors() * 4);

	static OpenViduServerManager openViduServerManager;
	public static LogHelper logHelper;

	public static String OPENVIDU_SECRET = "MY_SECRET";
	public static String OPENVIDU_URL = "https://localhost:4443/";
	public static String APP_URL = "http://localhost:8080/";
	public static String RECORDING_OUTPUT_MODE = "INDIVIDUAL";
	public static Boolean IS_FILTER_ENABLED = false;
	public static int SESSIONS = 100;
	public static int USERS_SESSION = 2;
	public static int SECONDS_OF_WAIT = 60;
	public static int NUMBER_OF_POLLS = 8;
	static int BROWSER_POLL_INTERVAL = 1000;
	public static int SERVER_POLL_INTERVAL = 5000;
	public static String SERVER_SSH_USER = "ubuntu";
	public static String SERVER_SSH_HOSTNAME;
	public static String PRIVATE_KEY_PATH = "/opt/openvidu/testload/key.pem";
	public static boolean REMOTE = true;
	public static boolean BROWSER_INIT_AT_ONCE = false;
	public static String RESULTS_PATH = "/opt/openvidu/testload";
	public static boolean DOWNLOAD_OPENVIDU_LOGS = true;
	public static int[] RECORD_BROWSERS;
	public static JsonObject[] NETWORK_RESTRICTIONS_BROWSERS;
	public static boolean TCPDUMP_CAPTURE_BEFORE_CONNECT;
	public static int TCPDUMP_CAPTURE_TIME = 0;
	public static int SESSION_AFTER_FULL_CPU = 4;
	public static long SECONDS_WITH_ALL_SESSIONS_ACTIVE = 600;
	public static double CPU_USAGE_LIMIT = 100.0;

	static BrowserProvider browserProvider;
	public static Long timeTestStarted;
	static Map<String, Long> timeSessionStarted = new ConcurrentHashMap<>();

	public static Map<String, Collection<Browser>> sessionIdsBrowsers = new ConcurrentHashMap<>();

	static final CustomLatch[] startNewSession = new CustomLatch[1];
	static final CustomLatch[] lastRoundCount = new CustomLatch[1];
	static AtomicBoolean lastBrowserRound = new AtomicBoolean(false);
	static String lastSession;

	@BeforeAll()
	static void setup() {
		WebDriverManager.chromedriver().setup();

		String openviduUrl = System.getProperty("OPENVIDU_URL");
		String openviduSecret = System.getProperty("OPENVIDU_SECRET");
		String appUrl = System.getProperty("APP_URL");
		String recordingOutputMode = System.getProperty("RECORDING_OUTPUT_MODE");
		Boolean isFilterEnabled = Boolean.parseBoolean(System.getProperty("IS_FILTER_ENABLED"));
		String sessions = System.getProperty("SESSIONS");
		String usersSession = System.getProperty("USERS_SESSION");
		String secondsOfWait = System.getProperty("SECONDS_OF_WAIT");
		String numberOfPolls = System.getProperty("NUMBER_OF_POLLS");
		String browserPollInterval = System.getProperty("BROWSER_POLL_INTERVAL");
		String serverPollInterval = System.getProperty("SERVER_POLL_INTERVAL");
		String serverSshUser = System.getProperty("SERVER_SSH_USER");
		String privateKeyPath = System.getProperty("PRIVATE_KEY_PATH");
		String remote = System.getProperty("REMOTE");
		String browserInitAtOnce = System.getProperty("BROWSER_INIT_AT_ONCE");
		String resultsPath = System.getProperty("RESULTS_PATH");
		String downloadOpenviduLogs = System.getProperty("DOWNLOAD_OPENVIDU_LOGS");
		String recordBrowsers = System.getProperty("RECORD_BROWSERS");
		String networkRestrictionsBrowsers = System.getProperty("NETWORK_RESTRICTIONS_BROWSERS");
		String tcpdumpCaptureBeforeConnect = System.getProperty("TCPDUMP_CAPTURE_BEFORE_CONNECT");
		String tcpdumpCaptureTime = System.getProperty("TCPDUMP_CAPTURE_TIME");
		String sessionAfterFullCpu = System.getProperty("SESSION_AFTER_FULL_CPU");
		String secondsWithAllSessionsActive = System.getProperty("SECONDS_WITH_ALL_SESSIONS_ACTIVE");


		if (openviduUrl != null) {
			OPENVIDU_URL = openviduUrl;
		}
		if (openviduSecret != null) {
			OPENVIDU_SECRET = openviduSecret;
		}
		if (appUrl != null) {
			APP_URL = appUrl;
		}
		if (recordingOutputMode != null){
			RECORDING_OUTPUT_MODE = recordingOutputMode;
		}
		if (isFilterEnabled != null){
			IS_FILTER_ENABLED = isFilterEnabled;
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
		if (serverPollInterval != null) {
			SERVER_POLL_INTERVAL = Integer.parseInt(serverPollInterval);
		}
		if (serverSshUser != null) {
			SERVER_SSH_USER = serverSshUser;
		}
		if (privateKeyPath != null) {
			PRIVATE_KEY_PATH = privateKeyPath;
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
		if (downloadOpenviduLogs != null) {
			DOWNLOAD_OPENVIDU_LOGS = Boolean.parseBoolean(downloadOpenviduLogs);
		}
		if (tcpdumpCaptureBeforeConnect != null) {
			TCPDUMP_CAPTURE_BEFORE_CONNECT = Boolean.parseBoolean(tcpdumpCaptureBeforeConnect);
		}
		if (tcpdumpCaptureTime != null) {
			TCPDUMP_CAPTURE_TIME = Integer.parseInt(tcpdumpCaptureTime);
		}
		if (sessionAfterFullCpu != null) {
			SESSION_AFTER_FULL_CPU = Integer.parseInt(sessionAfterFullCpu);
		}
		if (secondsWithAllSessionsActive != null) {
			SECONDS_WITH_ALL_SESSIONS_ACTIVE = Integer.parseInt(secondsWithAllSessionsActive);
		}

		initializeRecordBrowsersProperty(recordBrowsers);
		initializeNetworkRestrictionsBrowsersProperty(networkRestrictionsBrowsers);

		SERVER_SSH_HOSTNAME = OpenViduLoadTest.OPENVIDU_URL.replace("https://", "").replaceAll(":[0-9]+/$", "")
				.replaceAll("/$", "");

		browserProvider = REMOTE ? new RemoteBrowserProvider() : new LocalBrowserProvider();
		startNewSession[0] = new CustomLatch(USERS_SESSION * NUMBER_OF_POLLS);
		lastRoundCount[0] = new CustomLatch(USERS_SESSION * NUMBER_OF_POLLS);

		try {
			logHelper = new LogHelper();
		} catch (IOException e) {
			log.error("Result output file couldn't be opened: {}", e.toString());
			Assert.fail("Result output file couldn't be opened: " + e.toString());
			return;
		}

		// Accept insecure certificates when consuming OpenVidu Server REST API
		TrustManager[] trustAllCerts = new TrustManager[] { new X509TrustManager() {
			public java.security.cert.X509Certificate[] getAcceptedIssuers() {
				return null;
			}

			public void checkClientTrusted(X509Certificate[] certs, String authType) {
			}

			public void checkServerTrusted(X509Certificate[] certs, String authType) {
			}
		} };

		try {
			SSLContext sc = SSLContext.getInstance("SSL");
			sc.init(null, trustAllCerts, new java.security.SecureRandom());
			HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
		} catch (KeyManagementException | NoSuchAlgorithmException e) {
			e.printStackTrace();
		}

		// Create all-trusting host name verifier
		HostnameVerifier allHostsValid = new HostnameVerifier() {
			public boolean verify(String hostname, SSLSession session) {
				return true;
			}
		};
		// Install the all-trusting host verifier
		HttpsURLConnection.setDefaultHostnameVerifier(allHostsValid);

		// Test information logging
		String testInfo = "------------ TEST CONFIGURATION ----------" + System.getProperty("line.separator")
				+ "OpenVidu URL:          " + OPENVIDU_URL + System.getProperty("line.separator")
				+ "OpenVidu secret:       " + OPENVIDU_SECRET + System.getProperty("line.separator")
				+ "App URL:               " + APP_URL + System.getProperty("line.separator") + "Recording Mode:         "
				+  RECORDING_OUTPUT_MODE + System.getProperty("line.separator") + "Is filter enabled: " + IS_FILTER_ENABLED
				+  System.getProperty("line.separator") + "Session limit:         "
				+ SESSIONS + System.getProperty("line.separator") + "Users per session:     " + USERS_SESSION
				+ System.getProperty("line.separator") + "Expected browsers:     " + SESSIONS * USERS_SESSION
				+ System.getProperty("line.separator") + "Expected Publishers:   " + SESSIONS * USERS_SESSION
				+ System.getProperty("line.separator") + "Expected Subscribers:  "
				+ SESSIONS * (USERS_SESSION * (USERS_SESSION - 1)) + System.getProperty("line.separator")
				+ "Browsers init at once: " + BROWSER_INIT_AT_ONCE + System.getProperty("line.separator")
				+ "Browsers recorded:     " + Arrays.toString(RECORD_BROWSERS) + System.getProperty("line.separator")
				+ "Browsers networking:   " + Arrays.toString(NETWORK_RESTRICTIONS_BROWSERS)
				+ System.getProperty("line.separator") + "Start tcpdump before connect:  "
				+ TCPDUMP_CAPTURE_BEFORE_CONNECT + System.getProperty("line.separator") + "Tcpdump during:        "
				+ TCPDUMP_CAPTURE_TIME + " s" + System.getProperty("line.separator") + "Session limit after CPU is 100%: "
				+ SESSION_AFTER_FULL_CPU + " s" + System.getProperty("line.separator") + "Is remote:             "
				+ REMOTE + System.getProperty("line.separator") + "Results stored under:  "
				+ OpenViduLoadTest.RESULTS_PATH + System.getProperty("line.separator") + "Seconds all sessions active: "
				+ SECONDS_WITH_ALL_SESSIONS_ACTIVE + System.getProperty("line.separator")
				+ "----------------------------------------";
		logHelper.logTestInfo(testInfo);
		log.info(System.getProperty("line.separator") + testInfo);
	}

	@AfterAll
	static void bringDown() {

		// Log test finished event
		JsonObject testFinishedEvent = new JsonObject();
		testFinishedEvent.addProperty("name", "testFinished");
		testFinishedEvent.addProperty("secondsSinceTestStarted",
				(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
		logHelper.logTestEvent(testFinishedEvent);

		// Leave participants and close browsers
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

		// Stop OpenVidu Server monitoring thread
		openViduServerManager.stopMonitoringPolling();

		log.info("Load test finished");

		// Terminate all instances
		browserProvider.terminateInstances();

		// Close results file
		try {
			logHelper.closeLogFile();
		} catch (IOException e) {
			log.error("Error closing results file: {}", e.getMessage());
		}

		// Process test results
		ResultsParser resultsParser = new ResultsParser(logHelper);
		resultsParser.processLoadTestStats();
		resultsParser.processTcpdumps();

		// Download remote result files from OpenVidu Server instance if configured
		if (DOWNLOAD_OPENVIDU_LOGS) {
			log.info("Test configured to download remote result files");
			try {
				openViduServerManager = new OpenViduServerManager();
				openViduServerManager.downloadOpenViduKmsLogFiles();
			} catch (InterruptedException e) {
				log.error("Some log download thread couldn't finish in 5 minutes: {}", e.getMessage());
			}
			log.info("All remote files have been successfully downloaded");
		} else {
			log.info("Test configured to NOT download remote result files (DOWNLOAD_OPENVIDU_LOGS=false)");
		}

		// Close results file
		try {
			logHelper.closeInfoFile();
		} catch (IOException e) {
			log.error("Error closing results file: {}", e.getMessage());
		}

		// Copy test log file to results folder
		try {
			FileUtils.copyFile(new File("./logs/test.log"), new File(OpenViduLoadTest.RESULTS_PATH + "/test.log"));
		} catch (IOException e) {
			e.printStackTrace();
		}

		// Compress result files into zip
		try {
			new ZipGenerator().zipFiles();
		} catch (IOException e) {
			e.printStackTrace();
		}

		log.info("TEST FINISHED");
	}

	@Test
	@DisplayName("Load testing")
	void loadTest() throws Exception {
		log.info("Starting load test");
		timeTestStarted = System.currentTimeMillis();

		// Log test started event
		JsonObject testStartedEvent = new JsonObject();
		testStartedEvent.addProperty("name", "testStarted");
		JsonObject jsonProperties = new JsonObject();
		jsonProperties.addProperty("sessions", SESSIONS);
		jsonProperties.addProperty("usersSession", USERS_SESSION);
		testStartedEvent.add("properties", jsonProperties);
		logHelper.logTestEvent(testStartedEvent);

		// Init OpenVidu Serve monitoring thread
		openViduServerManager = new OpenViduServerManager();
		openViduServerManager.cleanTurnLogs();
		openViduServerManager.startMonitoringPolling();

		if (BROWSER_INIT_AT_ONCE) {
			this.startSessionAllBrowsersAtOnce(1);
		} else {
			this.startSessionBrowserAfterBrowser(1, 0);
		}
	}

	/**
	 * Each browser initialization is done asynchronously (and the same browser
	 * initialization thread is in charge of running the test)
	 **/

	private void startSessionBrowserAfterBrowser(int sessionIndex, int sessionsAfterMaxCpu) {
		String sessionId = "session-" + sessionIndex;
		int actualSessionsAfterMaxCpu = sessionsAfterMaxCpu;
		lastSession = sessionId;
		log.info("Starting session: {}", sessionId);
		final Collection<Runnable> threads = new ArrayList<>();

		for (int user = 1; user <= USERS_SESSION; user++) {
			final int userIndex = user;
			final String userId = "user-" + sessionIndex + "-" + userIndex;
			threads.add(() -> {
				try {
					startBrowser(sessionIndex, userIndex);
				} catch (TimeoutException e) {
					if (lastBrowserRound.get()) {
						lastRoundCount[0]
								.abort("User '" + userId + "' in session '" + sessionId + "' for not receiving enough '"
										+ e.getMessage() + "' events in " + SECONDS_OF_WAIT + " seconds");
					} else {
						startNewSession[0]
								.abort("User '" + userId + "' in session '" + sessionId + "' for not receiving enough '"
										+ e.getMessage() + "' events in " + SECONDS_OF_WAIT + " seconds");
					}
				} catch (BrowserNotReadyException e) {
					if (lastBrowserRound.get()) {
						lastRoundCount[0].abort("Browser " + userId + " in session " + sessionId + " was not ready");
					} else {
						startNewSession[0].abort("Browser " + userId + " in session " + sessionId + " was not ready");
					}
				}
			});
		}
		for (Runnable r : threads) {
			browserInitializationTaskExecutor.execute(r);
		}

		double cpuUsage = openViduServerManager.getCpuUsage();
		log.info("CPU usage from LoadTest {}", cpuUsage);
		if(cpuUsage > CPU_USAGE_LIMIT) {
			actualSessionsAfterMaxCpu++;
		}
		log.info("Actual sessions afterMaxCPU: {}", actualSessionsAfterMaxCpu);
		if (sessionIndex < SESSIONS && actualSessionsAfterMaxCpu < SESSION_AFTER_FULL_CPU) {
			try {
				startNewSession[0].await();
			} catch (AbortedException e) {
				log.error("Some browser thread did not reach a stable session status: {}", e.getMessage());
				Assert.fail("Session did not reach stable status in timeout: " + e.getMessage());
				return;
			}
			startNewSession[0] = new CustomLatch(USERS_SESSION * NUMBER_OF_POLLS);
			log.info("Stats gathering rounds threshold for session {} reached ({} rounds). Next session scheduled",
					sessionId, NUMBER_OF_POLLS);

			this.startSessionBrowserAfterBrowser(sessionIndex + 1, actualSessionsAfterMaxCpu);
		} else {

			// Wait specified time to stop browsers
			try {
				log.info("Waiting {} seconds to end all sessions", SECONDS_WITH_ALL_SESSIONS_ACTIVE);
				Thread.sleep(SECONDS_WITH_ALL_SESSIONS_ACTIVE * 1000);
			} catch (InterruptedException e) {
				log.error("Can't wait for sessions to be active {} seconds", SECONDS_WITH_ALL_SESSIONS_ACTIVE);
				e.printStackTrace();
			}
			log.info("Session limit succesfully reached ({})", SESSIONS);
			lastBrowserRound.set(true);
			try {
				lastRoundCount[0].await();
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
		browserInitializationTaskExecutor.shutdown();
		try {
			browserInitializationTaskExecutor.awaitTermination(5, TimeUnit.MINUTES);
		} catch (InterruptedException e) {
			log.error("Browser tasks couldn't finish in 5 minutes");
			Assert.fail(e.getMessage());
			return;
		}
	}

	private void startBrowser(int sessionIndex, int userIndex) throws TimeoutException, BrowserNotReadyException {
		log.info("Starting user: user-{}-{}", sessionIndex, userIndex);
		browserThread(setupBrowser("chrome", sessionIndex, userIndex));
	}

	private Browser setupBrowser(String browserType, int sessionIndex, int userIndex) throws BrowserNotReadyException {
		String sessionId = "session-" + sessionIndex;
		String userId = "user-" + sessionIndex + "-" + userIndex;
		BrowserProperties properties = new BrowserProperties.Builder().type("chrome").sessionId(sessionId)
				.userId(userId).timeOfWaitInSeconds(SECONDS_OF_WAIT)
				.isRecorded(isBrowserRecorded(sessionIndex, userIndex))
				.networkRestriction(getNetworkRestriction(sessionIndex, userIndex)).build();

		Browser browser = browserProvider.getBrowser(properties);
		browser.getDriver().get(APP_URL + "?publicurl=" + OPENVIDU_URL + "&recordingmode=" + RECORDING_OUTPUT_MODE + "&secret="
		 		 + OPENVIDU_SECRET + "&sessionId=" + sessionId + "&userId=" + userId + "&filtercheckbox=" + IS_FILTER_ENABLED);
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

	private void startSessionAllBrowsersAtOnce(int sessionIndex) {
		String sessionId = "session-" + sessionIndex;
		lastSession = sessionId;
		log.info("Starting session: {}", sessionId);
		Collection<Runnable> threads = new ArrayList<>();
		try {
			threads = startMultipleBrowsers(sessionIndex);
		} catch (InterruptedException e) {
			log.error("Some browser was not ready. {}", e.getMessage());
			Assert.fail("Some browser was not ready. " + e.getMessage());
			return;
		}
		for (Runnable r : threads) {
			browserInitializationTaskExecutor.execute(r);
		}
		if (sessionIndex < SESSIONS) {
			try {
				startNewSession[0].await();
			} catch (AbortedException e) {
				log.error("Some browser thread did not reach a stable session status: {}", e.getMessage());
				Assert.fail(e.getMessage());
				return;
			}
			startNewSession[0] = new CustomLatch(USERS_SESSION * NUMBER_OF_POLLS);
			log.info("Stats gathering rounds threshold for session {} reached ({} rounds). Next session scheduled",
					sessionId, NUMBER_OF_POLLS);

			this.startSessionAllBrowsersAtOnce(sessionIndex + 1);
		} else {
			log.info("Session limit succesfully reached ({})", SESSIONS);
			lastBrowserRound.set(true);
			try {
				lastRoundCount[0].await();
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
		browserInitializationTaskExecutor.shutdown();
		try {
			browserInitializationTaskExecutor.awaitTermination(5, TimeUnit.MINUTES);
		} catch (InterruptedException e) {
			log.error("Browser tasks couldn't finish in 5 minutes");
			Assert.fail(e.getMessage());
			return;
		}
	}

	private Collection<Runnable> startMultipleBrowsers(int sessionIndex) throws InterruptedException {
		List<String> userIds = new ArrayList<>();
		for (int i = 1; i <= USERS_SESSION; i++) {
			userIds.add("user-" + sessionIndex + "-" + i);
		}
		log.info("Starting users: {}", userIds.toString());

		List<Browser> browsers = setupBrowsers(USERS_SESSION, "chrome", sessionIndex);
		final Collection<Runnable> browserThreads = new ArrayList<>();
		for (Browser b : browsers) {
			browserThreads.add(() -> {
				try {
					browserThread(b);
				} catch (TimeoutException e) {
					if (lastBrowserRound.get()) {
						lastRoundCount[0].abort("User '" + b.getUserId() + "' in session '" + b.getSessionId()
								+ "' for not receiving enough '" + e.getMessage() + "' events in " + SECONDS_OF_WAIT
								+ " seconds");
					} else {
						startNewSession[0].abort("User '" + b.getUserId() + "' in session '" + b.getSessionId()
								+ "' for not receiving enough '" + e.getMessage() + "' events in " + SECONDS_OF_WAIT
								+ " seconds");
					}
				}
			});
		}
		return browserThreads;
	}

	private List<Browser> setupBrowsers(int numberOfBrowsers, String browserType, int sessionIndex)
			throws InterruptedException {
		String sessionId = "session-" + sessionIndex;
		List<BrowserProperties> propertiesList = new ArrayList<>();

		for (int userIndex = 1; userIndex <= numberOfBrowsers; userIndex++) {
			String userId = "user-" + sessionIndex + "-" + userIndex;
			BrowserProperties properties = new BrowserProperties.Builder().type("chrome").sessionId(sessionId)
					.userId(userId).timeOfWaitInSeconds(SECONDS_OF_WAIT)
					.isRecorded(isBrowserRecorded(sessionIndex, userIndex))
					.networkRestriction(getNetworkRestriction(sessionIndex, userIndex)).build();
			propertiesList.add(properties);
		}

		List<Browser> listOfBrowsers = browserProvider.getBrowsers(propertiesList);
		sessionIdsBrowsers.putIfAbsent(sessionId, new ArrayList<>());
		int i = 0;

		for (Browser b : listOfBrowsers) {
			log.info("Browser {} connecting now to {}", b.getUserId(), APP_URL);
			b.getDriver().get(APP_URL + "?publicurl=" + OPENVIDU_URL + "&recordingmode=" + RECORDING_OUTPUT_MODE + "&secret=" + OPENVIDU_SECRET + "&sessionId="
					+ sessionId + "&userId=" + propertiesList.get(i).userId() + "&filtercheckbox=" + IS_FILTER_ENABLED);
			log.info("Browser {} is now connected to to {}", b.getUserId(), APP_URL);
			b.getManager().startEventPolling(propertiesList.get(i).userId(), sessionId);
			sessionIdsBrowsers.get(sessionId).add(b);
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
			logHelper.logTestEvent(sessionStartedEvent, timestamp);
		}

		// Wait until session is stable
		browser.getManager().waitUntilEventReaches("connectionCreated", USERS_SESSION);
		browser.getManager().waitUntilEventReaches("accessAllowed", 1);
		browser.getManager().waitUntilEventReaches("streamCreated", USERS_SESSION);

		try {
			browser.getManager().waitUntilEventReaches("streamPlaying", USERS_SESSION);
		} catch (TimeoutException e) {
			log.warn("Some Subscriber has not triggered 'streamPlaying' event for user {}", browser.getUserId());

			// Log session unstable for thread's user
			JsonObject sessionUnstableEvent = new JsonObject();
			sessionUnstableEvent.addProperty("name", "sessionUnstable");
			sessionUnstableEvent.addProperty("sessionId", browser.getSessionId());
			sessionUnstableEvent.addProperty("userId", browser.getUserId());
			sessionUnstableEvent.addProperty("secondsSinceTestStarted",
					(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
			sessionUnstableEvent.addProperty("secondsSinceSessionStarted",
					(System.currentTimeMillis() - OpenViduLoadTest.timeSessionStarted.get(browser.getSessionId()))
							/ 1000);
			logHelper.logTestEvent(sessionUnstableEvent);

			log.info("User {} requesting OpenVidu session information for {} (is UNSTABLE)", browser.getUserId(),
					browser.getSessionId());
			String sessionInfo = performGetApiSession(browser.getSessionId());
			log.info("User {} got OpenVidu session information for {} (is UNSTABLE)", browser.getUserId(),
					browser.getSessionId());
			if (sessionInfo != null) {
				logHelper.logOpenViduSessionInfo(sessionInfo);
			} else {
				log.warn("No session info could be retrieved for unstable browser {}", browser.getUserId());
			}

			browser.getManager().stopEventPolling();
			log.info(
					"User {} is now seeing a UNstable session ({}). OpenVidu events polling thread interrupted and starting stats gathering",
					browser.getUserId(), browser.getSessionId());
			startStatsGathering(browser);
		}

		browser.getWaiter().until(ExpectedConditions.numberOfElementsToBe(By.tagName("video"), USERS_SESSION));
		Assert.assertTrue(browser.getManager().assertMediaTracks(browser.getDriver().findElements(By.tagName("video")),
				true, true));

		// Start tcpdump process if option TCPDUMP_CAPTURE_BEFORE_CONNECT is false
		if (OpenViduLoadTest.TCPDUMP_CAPTURE_TIME > 0 && !OpenViduLoadTest.TCPDUMP_CAPTURE_BEFORE_CONNECT) {
			try {
				if (browser.getSshManager() == null) {
					BrowserSshManager sshManager = new BrowserSshManager(browser);
					browser.configureSshManager(sshManager);
				}
				log.info("Starting tcpdump process after connect for browser {}", browser.getUserId());
				browser.getSshManager().startTcpDump();
			} catch (Exception e) {
				log.error("Error when starting tcpdump process for browser {}: {}", browser.getUserId(),
						e.getMessage());
			}
		}

		// Stop tcpdump process after TCPDUMP_CAPTURE_TIME seconds
		if (OpenViduLoadTest.TCPDUMP_CAPTURE_TIME > 0) {
			OpenViduLoadTest.tcpdumpStopProcesses.schedule(() -> {
				browser.getSshManager().stopTcpDump();
			}, OpenViduLoadTest.TCPDUMP_CAPTURE_TIME, TimeUnit.SECONDS);
		}

		// Log session stable for thread's user
		JsonObject sessionStableEvent = new JsonObject();
		sessionStableEvent.addProperty("name", "sessionStable");
		sessionStableEvent.addProperty("sessionId", browser.getSessionId());
		sessionStableEvent.addProperty("userId", browser.getUserId());
		sessionStableEvent.addProperty("secondsSinceTestStarted",
				(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
		sessionStableEvent.addProperty("secondsSinceSessionStarted",
				(System.currentTimeMillis() - OpenViduLoadTest.timeSessionStarted.get(browser.getSessionId())) / 1000);
		logHelper.logTestEvent(sessionStableEvent);

		log.info("User {} requesting OpenVidu session information for {} (is STABLE)", browser.getUserId(),
				browser.getSessionId());
		String sessionInfo = performGetApiSession(browser.getSessionId());
		log.info("User {} got OpenVidu session information for {} (is STABLE)", browser.getUserId(),
				browser.getSessionId());
		if (sessionInfo != null) {
			logHelper.logOpenViduSessionInfo(sessionInfo);
		} else {
			log.warn("No session info could be retrieved for stable browser {}", browser.getUserId());
		}

		browser.getManager().stopEventPolling();

		log.info(
				"User {} is now seeing a stable session ({}). OpenVidu events polling thread interrupted and starting stats gathering",
				browser.getUserId(), browser.getSessionId());

		startStatsGathering(browser);
	}

	private void startStatsGathering(Browser browser) {
		// Session stable. Start webrtc stats gathering
		Runnable runnable = new Runnable() {
			int gatheringRoundCount = 1;

			@Override
			public void run() {
				browser.getManager().gatherEventsAndStats(browser.getUserId(), gatheringRoundCount);
				if (browser.getSessionId().equals(lastSession)) {
					startNewSession[0].succeed();
					if (lastBrowserRound.get()) {
						lastRoundCount[0].succeed();
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

	private String performGetApiSession(String sessionId) {
		URL url = null;
		String urlString = OpenViduLoadTest.OPENVIDU_URL + "api/sessions/" + sessionId + "?webRtcStats=true";
		try {
			url = new URL(urlString);
		} catch (MalformedURLException e) {
			log.error("Url {} is malformed", urlString);
		}

		HttpsURLConnection con = null;
		try {
			con = (HttpsURLConnection) url.openConnection();
		} catch (IOException e) {
			log.error("Error opening GET connection: ", e.getMessage());
		}
		try {
			con.setRequestMethod("GET");
		} catch (ProtocolException e) {
			log.error("Protocol exception: ", e.getMessage());
		}
		con.setRequestProperty("Content-Type", "application/json");

		String encoded = Base64.getEncoder()
				.encodeToString(("OPENVIDUAPP:" + OpenViduLoadTest.OPENVIDU_SECRET).getBytes(StandardCharsets.UTF_8));
		con.setRequestProperty("Authorization", "Basic " + encoded);
		con.setConnectTimeout(5000);
		con.setReadTimeout(5000);

		StringBuffer content = new StringBuffer();
		BufferedReader in = null;
		try {
			in = new BufferedReader(new InputStreamReader(con.getInputStream()));
			String inputLine;
			while ((inputLine = in.readLine()) != null) {
				content.append(inputLine);
			}
			in.close();
		} catch (SocketTimeoutException e) {
			log.error("Timeout error requesting session information for {}: {}", sessionId, e.getMessage());
			if (in != null) {
				try {
					in.close();
				} catch (IOException e1) {
					e1.printStackTrace();
				}
			}
			con.disconnect();
			return null;
		} catch (IOException e) {
			log.error(
					"An error different than a timeout has taken place when requesting session information for {}: {}",
					sessionId, e.getMessage());
			if (in != null) {
				try {
					in.close();
				} catch (IOException e1) {
					e1.printStackTrace();
				}
			}
			con.disconnect();
			return null;
		}
		con.disconnect();
		return content.toString();
	}

	private static void initializeRecordBrowsersProperty(String recordBrowsers) {
		if (recordBrowsers != null) {
			String[] items = recordBrowsers.replaceAll("\\[", "").replaceAll("\\]", "").replaceAll("\\s", "")
					.split(",");
			if (items.length < SESSIONS) {
				log.warn(
						"RECORD_BROWSERS array length ({}) is lower than the number of sessions to be launched ({}). Rest of sessions will not have recorded browsers",
						items.length, SESSIONS);
			} else if (items.length > SESSIONS) {
				log.warn(
						"RECORD_BROWSERS array length ({}) is higher than the number of sessions to be launched ({}). Excess array positions will not be taken into account",
						items.length, SESSIONS);
			}
			int[] results = new int[SESSIONS];
			boolean wrongType = false;

			for (int i = 0; i < SESSIONS; i++) {
				try {
					results[i] = i < items.length ? Integer.parseInt(items[i]) : 0;
				} catch (NumberFormatException nfe) {
					log.error(
							"RECORD_BROWSERS array element '{}' is not an integer. Setting property RECORD_BROWSERS to default value",
							items[i]);
					setRecordBrowsersDefaultValue();
					wrongType = true;
					break;
				}
			}
			if (!wrongType) {
				RECORD_BROWSERS = results;
			}
		} else {
			setRecordBrowsersDefaultValue();
		}
		log.info("Recording browsers {}", Arrays.toString(RECORD_BROWSERS));
	}

	private static void initializeNetworkRestrictionsBrowsersProperty(String networkRestrictionsBrowsers) {
		if (networkRestrictionsBrowsers != null) {
			JsonParser parser = new JsonParser();
			JsonArray items = null;
			try {
				items = parser.parse(networkRestrictionsBrowsers).getAsJsonArray();
			} catch (IllegalStateException e) {
				log.error(
						"Property NETWORK_RESTRICTIONS_BROWSERS is not a JSON array. Setting network restrictions to default value");
				setNetworkRestrictionBrowsersDefaultValue();
				return;
			}
			if (items.size() < SESSIONS) {
				log.warn(
						"NETWORK_RESTRICTIONS_BROWSERS array length ({}) is lower than the number of sessions to be launched ({}). Rest of sessions will have no network restrictions",
						items.size(), SESSIONS);
			} else if (items.size() > SESSIONS) {
				log.warn(
						"NETWORK_RESTRICTIONS_BROWSERS array length ({}) is higher than the number of sessions to be launched ({}). Excess array positions will not be taken into account",
						items.size(), SESSIONS);
			}
			JsonObject[] results = new JsonObject[SESSIONS];

			for (int i = 0; i < SESSIONS; i++) {
				JsonObject json;
				if (i < items.size()) {
					try {
						json = items.get(i).getAsJsonObject();
						int accumulatedUsers = 0;
						JsonObject jsonAux = new JsonObject();
						boolean clearRestoOfValues = false;
						for (Entry<String, JsonElement> entryJson : json.entrySet()) {
							try {
								NetworkRestriction.valueOf(entryJson.getKey());
							} catch (IllegalArgumentException e) {
								log.error(
										"Key {} of JSON object {} of property NETWORK_RESTRICTIONS_BROWSERS must be \"ALL_OPEN\", \"TCP_ONLY\" or \"TURN\". Setting item to default value",
										entryJson.getKey(), entryJson.toString());
								json = new JsonObject();
								json.addProperty("ALL_OPEN", USERS_SESSION);
								accumulatedUsers = USERS_SESSION;
								break;
							}
							try {
								int value = entryJson.getValue().getAsInt();
								if ((accumulatedUsers + value) < USERS_SESSION) {
									accumulatedUsers += value;
									jsonAux.add(entryJson.getKey(), entryJson.getValue());
								} else {
									entryJson.setValue(new JsonPrimitive(USERS_SESSION - accumulatedUsers));
									jsonAux.add(entryJson.getKey(), entryJson.getValue());
									clearRestoOfValues = true;
									break;
								}
							} catch (Exception e) {
								log.error(
										"Value {} in property {} of JSON object {} in property NETWORK_RESTRICTIONS_BROWSERS is not an integer. Setting item to default value",
										entryJson.getValue(), entryJson, json.toString());
								json = new JsonObject();
								json.addProperty("ALL_OPEN", USERS_SESSION);
								accumulatedUsers = USERS_SESSION;
								break;
							}
						}
						if (clearRestoOfValues) {
							json = jsonAux;
						} else if (accumulatedUsers != USERS_SESSION) {
							int allOpen = json.has("ALL_OPEN") ? json.get("ALL_OPEN").getAsInt() : 0;
							json.addProperty("ALL_OPEN", allOpen + USERS_SESSION - accumulatedUsers);
						}
					} catch (IllegalStateException e) {
						log.error(
								"Item {} with index {} of NETWORK_RESTRICTIONS_BROWSERS property is not a JSON object. Setting item to default value",
								items.get(i), i);
						json = new JsonObject();
						json.addProperty("ALL_OPEN", USERS_SESSION);
					}
				} else {
					json = new JsonObject();
					json.addProperty("ALL_OPEN", USERS_SESSION);
				}
				results[i] = json;
			}
			NETWORK_RESTRICTIONS_BROWSERS = results;
		} else {
			setNetworkRestrictionBrowsersDefaultValue();
		}
		log.info("Network restricitions {}", Arrays.toString(NETWORK_RESTRICTIONS_BROWSERS));
	}

	private static void setRecordBrowsersDefaultValue() {
		RECORD_BROWSERS = new int[SESSIONS];
		for (int i = 0; i < SESSIONS; i++) {
			RECORD_BROWSERS[i] = 0;
		}
	}

	private static void setNetworkRestrictionBrowsersDefaultValue() {
		NETWORK_RESTRICTIONS_BROWSERS = new JsonObject[SESSIONS];
		for (int i = 0; i < SESSIONS; i++) {
			JsonObject json = new JsonObject();
			json.addProperty("ALL_OPEN", USERS_SESSION);
			NETWORK_RESTRICTIONS_BROWSERS[i] = json;
		}
	}

	public boolean isBrowserRecorded(int sessionIndex, int userIndex) {
		return RECORD_BROWSERS[sessionIndex - 1] > (userIndex - 1);
	}

	public static boolean someBrowserIsRecorded() {
		return IntStream.of(RECORD_BROWSERS).sum() > 0;
	}

	public NetworkRestriction getNetworkRestriction(int sessionIndex, int userIndex) {
		JsonObject json = NETWORK_RESTRICTIONS_BROWSERS[sessionIndex - 1];
		Iterator<Entry<String, JsonElement>> it = json.entrySet().iterator();
		int totalBrowsersChecked = 0;
		String value = null;
		while (it.hasNext() && value == null) {
			Entry<String, JsonElement> restriction = it.next();
			totalBrowsersChecked += restriction.getValue().getAsInt();
			if (userIndex <= totalBrowsersChecked) {
				value = restriction.getKey();
			}
		}
		return NetworkRestriction.valueOf(value);
	}

}
