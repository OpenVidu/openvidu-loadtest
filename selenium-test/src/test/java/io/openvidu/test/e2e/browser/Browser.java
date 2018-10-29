package io.openvidu.test.e2e.browser;

import java.util.concurrent.TimeUnit;

import org.openqa.selenium.Dimension;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.WebDriverWait;

import io.openvidu.test.e2e.OpenViduEventManager;

public class Browser {

	protected WebDriver driver;
	protected WebDriverWait waiter;
	protected String clientData;
	protected int timeOfWaitInSeconds;
	protected OpenViduEventManager eventManager;

	Browser(String clientData, int timeOfWaitInSeconds, WebDriver driver) {
		this.clientData = clientData;
		this.timeOfWaitInSeconds = timeOfWaitInSeconds;
		this.driver = driver;
		this.driver.manage().timeouts().setScriptTimeout(this.timeOfWaitInSeconds, TimeUnit.SECONDS);
		this.waiter = new WebDriverWait(this.driver, this.timeOfWaitInSeconds);
		this.eventManager = new OpenViduEventManager(this.driver, this.timeOfWaitInSeconds);
		this.driver.manage().window().setSize(new Dimension(1920, 1080));
	}

	public WebDriver getDriver() {
		return this.driver;
	}

	public WebDriverWait getWaiter() {
		return this.waiter;
	}

	public OpenViduEventManager getEventManager() {
		return this.eventManager;
	}

	public String getClientData() {
		return this.clientData;
	}

	public int getTimeOfWait() {
		return this.timeOfWaitInSeconds;
	}

	protected void newWaiter(int timeOfWait) {
		this.waiter = new WebDriverWait(this.driver, timeOfWait);
	}

	public void dispose() {
		this.eventManager.stopPolling();
		this.driver.quit();
	}

}
