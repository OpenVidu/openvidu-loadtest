package io.openvidu.test.load.browser;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.net.MalformedURLException;
import java.net.URL;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.slf4j.Logger;

public class RemoteBrowserProvider implements BrowserProvider {

	final static Logger log = getLogger(lookup().lookupClass());

	@Override
	public Browser getBrowser(String browserType, String clientData, int timeOfWaitInSeconds) {

		Browser browser = null;
		DesiredCapabilities capabilities;
		String REMOTE_URL = "foo";

		switch (browserType) {
		case "chrome":
			ChromeOptions options = ChromeBrowser.generateFakeVideoChromeOptions("/opt/openvidu/fakevideo.y4m",
					"/opt/openvidu/fakeaudio.wav");
			capabilities = DesiredCapabilities.chrome();
			capabilities.setAcceptInsecureCerts(true);
			capabilities.setCapability(ChromeOptions.CAPABILITY, options);
			try {
				WebDriver driver = new RemoteWebDriver(new URL(REMOTE_URL), capabilities);
				browser = new ChromeBrowser(clientData, timeOfWaitInSeconds, driver);
			} catch (MalformedURLException e) {
				e.printStackTrace();
			}
			log.info("Using remote Chrome web driver");
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
