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

import java.util.ArrayList;
import java.util.List;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.slf4j.Logger;

/**
 * Manages local browsers (web driver and browser in the same host as this test)
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class LocalBrowserProvider implements BrowserProvider {

	final static Logger log = getLogger(lookup().lookupClass());

	@Override
	public Browser getBrowser(String browserType, String sessionId, String userId, boolean isRecorded,
			int timeOfWaitInSeconds) {
		Browser browser;
		DesiredCapabilities capabilities;

		switch (browserType) {
		case "chrome":
			ChromeOptions options = ChromeBrowser.generateFakeVideoChromeOptions("/opt/openvidu/fakevideo.y4m",
					"/opt/openvidu/fakeaudio.wav");
			capabilities = DesiredCapabilities.chrome();
			capabilities.setAcceptInsecureCerts(true);
			capabilities.setCapability(ChromeOptions.CAPABILITY, options);
			WebDriver driver = new ChromeDriver(options);
			browser = new ChromeBrowser(sessionId, userId, false, timeOfWaitInSeconds, driver);
			log.info("Using local Chrome web driver");
			break;
		/*
		 * case "firefox": break;
		 * 
		 * case "opera": break;
		 */
		default:
			return this.getBrowser("chrome", sessionId, userId, isRecorded, timeOfWaitInSeconds);
		}
		return browser;
	}

	@Override
	public List<Browser> getBrowsers(int numberOfBrowsers, String browserType, String sessionId, List<String> userIds,
			List<Boolean> areRecorded, int timeOfWaitInSeconds) {

		List<Browser> browsers = new ArrayList<>();
		DesiredCapabilities capabilities;

		switch (browserType) {
		case "chrome":
			ChromeOptions options = ChromeBrowser.generateFakeVideoChromeOptions("/opt/openvidu/fakevideo.y4m",
					"/opt/openvidu/fakeaudio.wav");
			capabilities = DesiredCapabilities.chrome();
			capabilities.setAcceptInsecureCerts(true);
			capabilities.setCapability(ChromeOptions.CAPABILITY, options);
			for (int i = 0; i < numberOfBrowsers; i++) {
				WebDriver driver = new ChromeDriver(options);
				browsers.add(new ChromeBrowser(sessionId, userIds.get(i), false, timeOfWaitInSeconds, driver));
			}
			log.info("Using local Chrome web drivers");
			break;
		default:
			return this.getBrowsers(numberOfBrowsers, "chrome", sessionId, userIds, areRecorded, timeOfWaitInSeconds);
		}
		return browsers;
	}

	@Override
	public void terminateInstances() {
		// Do nothing
		log.debug("LocalBrowserProvider does not terminate any instance");
	}

}
