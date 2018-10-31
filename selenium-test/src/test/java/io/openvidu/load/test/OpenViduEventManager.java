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

import java.io.IOException;
import java.util.Collection;
import java.util.HashSet;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.slf4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Manager event class for BrowserUser. Collects, cleans and stores events from
 * openvidu-testapp
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 * @since 1.1.1
 */
public class OpenViduEventManager {

	final static Logger log = getLogger(lookup().lookupClass());

	private static class RunnableCallback implements Runnable {

		private final Consumer<JsonObject> callback;
		private JsonObject eventResult;

		public RunnableCallback(Consumer<JsonObject> callback) {
			this.callback = callback;
		}

		public void setEventResult(JsonObject json) {
			this.eventResult = json;
		}

		@Override
		public void run() {
			callback.accept(this.eventResult);
		}
	}

	private Thread pollingThread;
	private ExecutorService execService = Executors.newCachedThreadPool();
	private WebDriver driver;
	private Queue<JsonObject> eventQueue;
	private Map<String, Collection<RunnableCallback>> eventCallbacks;
	private Map<String, AtomicInteger> eventNumbers;
	private Map<String, CountDownLatch> eventCountdowns;
	private AtomicBoolean isInterrupted = new AtomicBoolean(false);
	private int timeOfWaitInSeconds;

	private JsonParser jsonParser = new JsonParser();

	public OpenViduEventManager(WebDriver driver, int timeOfWaitInSeconds) {
		this.driver = driver;
		this.eventQueue = new ConcurrentLinkedQueue<JsonObject>();
		this.eventCallbacks = new ConcurrentHashMap<>();
		this.eventNumbers = new ConcurrentHashMap<>();
		this.eventCountdowns = new ConcurrentHashMap<>();
		this.timeOfWaitInSeconds = timeOfWaitInSeconds;
	}

	public void gatherEventsAndStats(String userId, int roundCount) {
		log.info("Gathering events and stats for user {} (round {})", userId, roundCount);
		this.getEventsAndStatsFromBrowser(false);
		this.emitEvents();
	}

	public void startEventPolling() {
		Thread.UncaughtExceptionHandler h = new Thread.UncaughtExceptionHandler() {
			public void uncaughtException(Thread th, Throwable ex) {
				if (ex.getClass().getSimpleName().equals("NoSuchSessionException")) {
					System.err.println("Disposing driver when running 'executeScript'");
				}
			}
		};

		this.pollingThread = new Thread(() -> {
			while (!this.isInterrupted.get()) {
				this.getEventsAndStatsFromBrowser(true);
				this.emitEvents();
				try {
					Thread.sleep(OpenViduLoadTest.BROWSER_POLL_INTERVAL);
				} catch (InterruptedException e) {
					e.printStackTrace();
				}
			}
		});
		this.pollingThread.setUncaughtExceptionHandler(h);
		this.pollingThread.start();
	}

	public void stopEventPolling() {
		this.eventCallbacks.clear();
		this.eventCountdowns.clear();
		this.eventNumbers.clear();
		this.isInterrupted.set(true);
		this.pollingThread.interrupt();
	}

	public void on(String eventName, Consumer<JsonObject> callback) {
		this.eventCallbacks.putIfAbsent(eventName, new HashSet<>());
		this.eventCallbacks.get(eventName).add(new RunnableCallback(callback));
	}

	public void off(String eventName) {
		this.eventCallbacks.remove(eventName);
	}

	// 'eventNumber' is accumulative for event 'eventName' for one page while it is
	// not refreshed
	public void waitUntilEventReaches(String eventName, int eventNumber) throws Exception {
		this.waitUntilEventReaches(eventName, eventNumber, this.timeOfWaitInSeconds, true);
	}

	public void waitUntilEventReaches(String eventName, int eventNumber, int secondsOfWait, boolean printTimeoutError)
			throws Exception {
		CountDownLatch eventSignal = new CountDownLatch(eventNumber);
		this.setCountDown(eventName, eventSignal);
		try {
			if (!eventSignal.await(secondsOfWait * 1000, TimeUnit.MILLISECONDS)) {
				throw (new TimeoutException());
			}
		} catch (InterruptedException | TimeoutException e) {
			if (printTimeoutError) {
				e.printStackTrace();
			}
			throw e;
		}
	}

	public boolean assertMediaTracks(Iterable<WebElement> videoElements, boolean audioTransmission,
			boolean videoTransmission) {
		boolean success = true;
		for (WebElement video : videoElements) {
			success = success && (audioTransmission == this.hasAudioTracks(video))
					&& (videoTransmission == this.hasVideoTracks(video));
			if (!success)
				break;
		}
		return success;
	}

	private AtomicInteger getNumEvents(String eventName) {
		return this.eventNumbers.computeIfAbsent(eventName, k -> new AtomicInteger(0));
	}

	private void setCountDown(String eventName, CountDownLatch cd) {
		this.eventCountdowns.put(eventName, cd);
		for (int i = 0; i < getNumEvents(eventName).get(); i++) {
			cd.countDown();
		}
	}

	private void emitEvents() {
		while (!this.eventQueue.isEmpty()) {
			JsonObject event = this.eventQueue.poll();
			if (this.eventCallbacks.containsKey(event.get("event").getAsString())) {
				for (RunnableCallback callback : this.eventCallbacks.get(event.get("event").getAsString())) {
					callback.setEventResult(event);
					execService.submit(callback);
				}
			}
		}
	}

	private void getEventsAndStatsFromBrowser(boolean ignoreStats) {
		JsonObject eventsAndStats = this.getEventsAndStatsInBrowser();

		if (eventsAndStats.isJsonNull()) {
			return;
		}

		JsonArray events = eventsAndStats.get("events").getAsJsonArray();
		for (JsonElement ev : events) {
			JsonObject event = ev.getAsJsonObject();
			String eventName = event.get("event").getAsString();

			this.eventQueue.add(event);
			getNumEvents(eventName).incrementAndGet();

			if (this.eventCountdowns.get(eventName) != null) {
				this.eventCountdowns.get(eventName).countDown();
			}
		}

		if (!ignoreStats) {
			JsonObject stats = eventsAndStats.get("stats").getAsJsonObject();
			JsonObject wrapper = new JsonObject();
			String sessionId = eventsAndStats.get("sessionId").getAsString();
			wrapper.addProperty("secondsSinceTestStarted",
					(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
			wrapper.addProperty("secondsSinceSessionStarted",
					(System.currentTimeMillis() - OpenViduLoadTest.timeSessionStarted.get(sessionId)) / 1000);
			wrapper.add(eventsAndStats.get("sessionId").getAsString(), stats);
			synchronized (OpenViduLoadTest.fileWriter) {
				try {
					OpenViduLoadTest.fileWriter.write(wrapper.toString() + System.getProperty("line.separator"));
				} catch (IOException e) {
					e.printStackTrace();
				}
			}
		}
	}

	private JsonObject getEventsAndStatsInBrowser() {
		// {
		// sessionId: 'session-1',
		// events: [
		// {
		// event: "connectionCreated",
		// content: 't0lt3h9nnmafi2hl'
		// }, ...
		// ],
		// stats: {
		// 'user-1-1': [
		// {
		// availableReceiveBandwidth: 1587,
		// availableSendBandwidth: 292,
		// bitRate: 482,
		// bytesReceived: "5338277",
		// candidateType: "local",
		// delay: "41",
		// jitter: "23",
		// localAddress: "192.168.0.102:53533",
		// remoteAddress: "172.17.0.2:23496",
		// rtt: "1",
		// transport: "udp"
		// }, ...
		// ],
		// 'user-1-2': ...
		// }
		// }
		String eventsAndStats = (String) ((JavascriptExecutor) driver)
				.executeScript("window.collectEventsAndStats(); return JSON.stringify(window.openviduLoadTest);");
		return this.jsonParser.parse(eventsAndStats).getAsJsonObject();
	}

	public boolean hasMediaStream(WebElement videoElement) {
		boolean hasMediaStream = (boolean) ((JavascriptExecutor) driver).executeScript(
				"return (!!(document.getElementById('" + videoElement.getAttribute("id") + "').srcObject))");
		return hasMediaStream;
	}

	private boolean hasAudioTracks(WebElement videoElement) {
		boolean audioTracks = (boolean) ((JavascriptExecutor) driver)
				.executeScript("return ((document.getElementById('" + videoElement.getAttribute("id")
						+ "').srcObject.getAudioTracks().length > 0)" + "&& (document.getElementById('"
						+ videoElement.getAttribute("id") + "').srcObject.getAudioTracks()[0].enabled))");
		return audioTracks;
	}

	private boolean hasVideoTracks(WebElement videoElement) {
		boolean videoTracks = (boolean) ((JavascriptExecutor) driver)
				.executeScript("return ((document.getElementById('" + videoElement.getAttribute("id")
						+ "').srcObject.getVideoTracks().length > 0)" + "&& (document.getElementById('"
						+ videoElement.getAttribute("id") + "').srcObject.getVideoTracks()[0].enabled))");
		return videoTracks;
	}

}
