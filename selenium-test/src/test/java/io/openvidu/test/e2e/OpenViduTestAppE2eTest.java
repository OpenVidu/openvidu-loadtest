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

package io.openvidu.test.e2e;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.platform.runner.JUnitPlatform;
import org.junit.runner.RunWith;
import org.slf4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonParser;

import io.github.bonigarcia.SeleniumExtension;
import io.github.bonigarcia.wdm.WebDriverManager;
import io.openvidu.test.e2e.browser.Browser;
import io.openvidu.test.e2e.browser.BrowserProvider;
import io.openvidu.test.e2e.browser.LocalBrowserProvider;
import io.openvidu.test.e2e.browser.RemoteBrowserProvider;

/**
 * E2E test for OpenVidu load testing
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
@Tag("Load test")
@DisplayName("OpenVidu load test")
@ExtendWith(SeleniumExtension.class)
@RunWith(JUnitPlatform.class)
public class OpenViduTestAppE2eTest {

	final static Logger log = getLogger(lookup().lookupClass());

	static String OPENVIDU_SECRET = "MY_SECRET";
	static String OPENVIDU_URL = "https://localhost:4443/";
	static String APP_URL = "http://localhost:8080/";
	static List<Integer> SESSIONS = new ArrayList<Integer>();
	static boolean REMOTE = false;

	static BrowserProvider browserProvider;
	Collection<Browser> browsers = new ArrayList<Browser>();

	@BeforeAll()
	static void setup() {
		WebDriverManager.chromedriver().setup();

		String openviduUrl = System.getProperty("OPENVIDU_URL");
		String openviduSecret = System.getProperty("OPENVIDU_SECRET");
		String appUrl = System.getProperty("APP_URL");
		String sessionsString = System.getProperty("SESSIONS");
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
		if (sessionsString != null) {
			JsonArray sessionsJsonArray = new JsonParser().parse(sessionsString).getAsJsonArray();
			sessionsJsonArray.forEach(s -> {
				OpenViduTestAppE2eTest.SESSIONS.add(s.getAsInt());
			});
		} else {
			OpenViduTestAppE2eTest.SESSIONS.add(1);
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

	Browser setupBrowser(String browserType, String sessionId, String userId) {
		Browser browser = browserProvider.getBrowser(browserType, userId, 30);
		browser.getDriver().get(APP_URL + "?publicurl=" + OPENVIDU_URL + "&secret=" + OPENVIDU_SECRET + "&sessionId="
				+ sessionId + "&userId=" + userId);
		browser.getEventManager().startPolling();
		this.browsers.add(browser);
		return browser;
	}

	@Test
	@DisplayName("Load testing")
	void loadTest() throws Exception {

		log.info("> Starting load test. Running sessions until limit: {}", SESSIONS.get(0));
		for (int i = 1; i <= SESSIONS.get(0); i++) {
			String sessionId = "session-" + i;
			log.info("    > Starting session: {}", sessionId);
			for (int user = 1; user <= 7; user++) {
				String userId = "user-" + i + "-" + user;
				log.info("      > Starting user: {}", userId);
				Browser browser = setupBrowser("chrome", sessionId, userId);
				Thread.sleep(3000);

				/*
				 * browser.getEventManager().waitUntilEventReaches("connectionCreated", 4);
				 * browser.getEventManager().waitUntilEventReaches("accessAllowed", 2);
				 * browser.getEventManager().waitUntilEventReaches("streamCreated", 4);
				 * browser.getEventManager().waitUntilEventReaches("streamPlaying", 4);
				 * 
				 * try { System.out.println(getBase64Screenshot(browser)); } catch (Exception e)
				 * { e.printStackTrace(); }
				 * 
				 * Assert.assertEquals(browser.getDriver().findElements(By.tagName("video")).
				 * size(), 4); Assert.assertTrue(browser.getEventManager()
				 * .assertMediaTracks(browser.getDriver().findElements(By.tagName("video")),
				 * true, true));
				 * 
				 * gracefullyLeaveParticipants(2);
				 */
			}

			// If test fails do not continue with next block
			break;
		}
	}

	/*
	 * private void listEmptyRecordings() { // List existing recordings (empty)
	 * browser.getDriver().findElement(By.id("list-recording-btn")).click();
	 * browser.getWaiter()
	 * .until(ExpectedConditions.attributeToBe(By.id("api-response-text-area"),
	 * "value", "Recording list []")); }
	 * 
	 * private ExpectedCondition<Boolean> waitForVideoDuration(WebElement element,
	 * int durationInSeconds) { return new ExpectedCondition<Boolean>() {
	 * 
	 * @Override public Boolean apply(WebDriver input) { return
	 * element.getAttribute("duration").matches( durationInSeconds - 1 +
	 * "\\.[8-9][0-9]{0,5}|" + durationInSeconds + "\\.[0-2][0-9]{0,5}"); } }; }
	 * 
	 * private boolean checkVideoAverageRgbGreen(Map<String, Long> rgb) { // GREEN
	 * color: {r < 15, g > 130, b <15} return (rgb.get("r") < 15) && (rgb.get("g") >
	 * 130) && (rgb.get("b") < 15); }
	 * 
	 * private boolean checkVideoAverageRgbGray(Map<String, Long> rgb) { // GRAY
	 * color: {r < 50, g < 50, b < 50} and the absolute difference between them //
	 * not greater than 2 return (rgb.get("r") < 50) && (rgb.get("g") < 50) &&
	 * (rgb.get("b") < 50) && (Math.abs(rgb.get("r") - rgb.get("g")) <= 2) &&
	 * (Math.abs(rgb.get("r") - rgb.get("b")) <= 2) && (Math.abs(rgb.get("b") -
	 * rgb.get("g")) <= 2); }
	 * 
	 * private void gracefullyLeaveParticipants(int numberOfParticipants) throws
	 * Exception { int accumulatedConnectionDestroyed = 0; for (int j = 1; j <=
	 * numberOfParticipants; j++) {
	 * browser.getDriver().findElement(By.id("remove-user-btn")).sendKeys(Keys.ENTER
	 * ); browser.getEventManager().waitUntilEventReaches("sessionDisconnected", j);
	 * accumulatedConnectionDestroyed = (j != numberOfParticipants) ?
	 * (accumulatedConnectionDestroyed + numberOfParticipants - j) :
	 * (accumulatedConnectionDestroyed);
	 * browser.getEventManager().waitUntilEventReaches("connectionDestroyed",
	 * accumulatedConnectionDestroyed); } }
	 * 
	 * private String getBase64Screenshot(Browser browser) throws Exception { String
	 * screenshotBase64 = ((TakesScreenshot)
	 * browser.getDriver()).getScreenshotAs(BASE64); return "data:image/png;base64,"
	 * + screenshotBase64; }
	 */

	/*private void gracefullyLeaveParticipant() throws Exception {
		int accumulatedConnectionDestroyed = 0;
		for (int j = 1; j <= numberOfParticipants; j++) {
			browser.getDriver().findElement(By.id("remove-user-btn")).sendKeys(Keys.ENTER);
			browser.getEventManager().waitUntilEventReaches("sessionDisconnected", j);
			accumulatedConnectionDestroyed = (j != numberOfParticipants)
					? (accumulatedConnectionDestroyed + numberOfParticipants - j)
					: (accumulatedConnectionDestroyed);
			browser.getEventManager().waitUntilEventReaches("connectionDestroyed", accumulatedConnectionDestroyed);
		}
	}*/

}
