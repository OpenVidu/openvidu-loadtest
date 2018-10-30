package io.openvidu.load.test.browser;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.slf4j.Logger;

public class LocalBrowserProvider implements BrowserProvider {

	final static Logger log = getLogger(lookup().lookupClass());

	@Override
	public Browser getBrowser(String browserType, String clientData, int timeOfWaitInSeconds) {
		Browser browser;
		DesiredCapabilities capabilities;

		switch (browserType) {
		case "chrome":
			ChromeOptions options = ChromeBrowser.generateFakeVideoChromeOptions("/opt/openvidu/fakevideo.y4m",
					"/opt/openvidu/fakeaudio.wav");
			capabilities = DesiredCapabilities.chrome();
			capabilities.setAcceptInsecureCerts(true);
			capabilities.setCapability(ChromeOptions.CAPABILITY, options);
			WebDriver driver = new ChromeDriver(capabilities);
			browser = new ChromeBrowser(clientData, timeOfWaitInSeconds, driver);
			log.info("Using local Chrome web driver");
			break;
		/*
		 * case "firefox":
		 * 
		 * break; case "opera":
		 * 
		 * break;
		 */
		default:
			return this.getBrowser("chrome", clientData, timeOfWaitInSeconds);
		}
		return browser;
	}
}
