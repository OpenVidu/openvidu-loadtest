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

import java.util.concurrent.TimeUnit;

import org.openqa.selenium.Dimension;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.slf4j.Logger;

import io.openvidu.load.test.OpenViduEventAndStatsManager;

/**
 * Browser encapsulation for OpenVidu load testing
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class Browser {

	final static Logger log = getLogger(lookup().lookupClass());

	protected WebDriver driver;
	protected WebDriverWait waiter;
	protected String sessionId;
	protected String userId;
	protected int timeOfWaitInSeconds;
	protected OpenViduEventAndStatsManager eventManager;

	Browser(String sessionId, String userId, int timeOfWaitInSeconds, WebDriver driver) {
		this.sessionId = sessionId;
		this.userId = userId;
		this.timeOfWaitInSeconds = timeOfWaitInSeconds;
		this.driver = driver;
		this.driver.manage().timeouts().setScriptTimeout(this.timeOfWaitInSeconds, TimeUnit.SECONDS);
		this.waiter = new WebDriverWait(this.driver, this.timeOfWaitInSeconds);
		this.eventManager = new OpenViduEventAndStatsManager(this.driver, this.timeOfWaitInSeconds);
		this.driver.manage().window().setSize(new Dimension(1920, 1080));
	}

	public WebDriver getDriver() {
		return this.driver;
	}

	public WebDriverWait getWaiter() {
		return this.waiter;
	}

	public OpenViduEventAndStatsManager getManager() {
		return this.eventManager;
	}

	public String getSessionId() {
		return this.sessionId;
	}

	public String getUserId() {
		return this.userId;
	}

	public int getTimeOfWait() {
		return this.timeOfWaitInSeconds;
	}

	protected void newWaiter(int timeOfWait) {
		this.waiter = new WebDriverWait(this.driver, timeOfWait);
	}

	public void dispose() {
		log.info("Closing browser for participant {}", this.getUserId());
		this.driver.quit();
	}

}
