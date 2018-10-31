package io.openvidu.load.test.browser;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.util.concurrent.TimeUnit;

import org.openqa.selenium.Dimension;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.slf4j.Logger;

import io.openvidu.load.test.OpenViduEventManager;

public class Browser {

	final static Logger log = getLogger(lookup().lookupClass());

	protected WebDriver driver;
	protected WebDriverWait waiter;
	protected String sessionId;
	protected String userId;
	protected int timeOfWaitInSeconds;
	protected OpenViduEventManager eventManager;

	Browser(String sessionId, String userId, int timeOfWaitInSeconds, WebDriver driver) {
		this.sessionId = sessionId;
		this.userId = userId;
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
