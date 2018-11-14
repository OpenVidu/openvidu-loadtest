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

import io.openvidu.load.test.OpenViduTestClientsManager;
import io.openvidu.load.test.models.AmazonInstance;
import io.openvidu.load.test.utils.BrowserSshManager;

/**
 * Browser encapsulation for OpenVidu load testing
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class Browser {

	final static Logger log = getLogger(lookup().lookupClass());

	protected WebDriver driver;
	protected WebDriverWait waiter;
	protected BrowserProperties properties;
	protected OpenViduTestClientsManager eventManager;
	protected BrowserSshManager sshManager;
	protected AmazonInstance instance;

	Browser(BrowserProperties properties, WebDriver driver) {
		this(properties, null, driver);
	}

	Browser(BrowserProperties properties, AmazonInstance instance, WebDriver driver) {
		this.properties = properties;
		this.instance = instance;
		this.driver = driver;
		this.driver.manage().timeouts().setScriptTimeout(properties.timeOfWaitInSeconds(), TimeUnit.SECONDS);
		this.waiter = new WebDriverWait(this.driver, (properties.timeOfWaitInSeconds()));
		this.eventManager = new OpenViduTestClientsManager(this.driver, (properties.timeOfWaitInSeconds()));
		this.driver.manage().window().setSize(new Dimension(1920, 1080));
	}

	public AmazonInstance getInstance() {
		return this.instance;
	}

	public WebDriver getDriver() {
		return this.driver;
	}

	public WebDriverWait getWaiter() {
		return this.waiter;
	}

	public OpenViduTestClientsManager getManager() {
		return this.eventManager;
	}

	public BrowserProperties getBrowserProperties() {
		return this.properties;
	}

	public String getSessionId() {
		return this.properties.sessionId();
	}

	public String getUserId() {
		return this.properties.userId();
	}

	public boolean isRecorded() {
		return this.properties.isRecorded();
	}

	public NetworkRestriction networkRestriction() {
		return this.properties.networkRestriction();
	}

	public void configureSshManager(BrowserSshManager sshManager) {
		this.sshManager = sshManager;
	}

	public BrowserSshManager getSshManager() {
		return this.sshManager;
	}

	public void setRecorded(boolean recorded) {
		this.properties.changeRecordedConfig(recorded);
	}

	public int getTimeOfWait() {
		return this.properties.timeOfWaitInSeconds();
	}

	protected void newWaiter(int timeOfWait) {
		this.waiter = new WebDriverWait(this.driver, timeOfWait);
	}

	public void dispose() {
		log.info("Closing browser for participant {}", this.getUserId());
		this.driver.quit();
	}

}
