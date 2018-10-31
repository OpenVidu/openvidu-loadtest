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

public class LocalBrowserProvider implements BrowserProvider {

	final static Logger log = getLogger(lookup().lookupClass());

	@Override
	public Browser getBrowser(String browserType, String sessionId, String userId, int timeOfWaitInSeconds) {
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
			browser = new ChromeBrowser(sessionId, userId, timeOfWaitInSeconds, driver);
			log.info("Using local Chrome web driver");
			break;
		/*
		 * case "firefox": break;
		 * 
		 * case "opera": break;
		 */
		default:
			return this.getBrowser("chrome", sessionId, userId, timeOfWaitInSeconds);
		}
		return browser;
	}

	@Override
	public List<Browser> getBrowsers(int numberOfBrowsers, String browserType, String sessionId, List<String> userIds,
			int timeOfWaitInSeconds) {

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
				browsers.add(new ChromeBrowser(sessionId, userIds.get(i), timeOfWaitInSeconds, driver));
			}
			log.info("Using local Chrome web drivers");
			break;
		default:
			return this.getBrowsers(numberOfBrowsers, "chrome", sessionId, userIds, timeOfWaitInSeconds);
		}
		return browsers;
	}

}
