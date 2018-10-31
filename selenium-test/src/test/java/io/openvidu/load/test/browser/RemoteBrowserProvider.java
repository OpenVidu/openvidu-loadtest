package io.openvidu.load.test.browser;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.slf4j.Logger;

import io.openvidu.load.test.AmazonInstance;
import io.openvidu.load.test.ScriptExecutor;

public class RemoteBrowserProvider implements BrowserProvider {

	final static Logger log = getLogger(lookup().lookupClass());

	ScriptExecutor executor = new ScriptExecutor();
	Map<String, AmazonInstance> amazonInstances = new ConcurrentHashMap<>();
	Map<String, Browser> amazonBrowsers = new ConcurrentHashMap<>();

	final String URL_END = ":4444/wd/hub/session";

	@Override
	public Browser getBrowser(String browserType, String sessionId, String userId, int timeOfWaitInSeconds) {

		Map<String, AmazonInstance> map = this.executor.launchBrowsers(1);
		Browser browser = null;
		DesiredCapabilities capabilities;

		switch (browserType) {
		case "chrome":
			ChromeOptions options = ChromeBrowser.generateFakeVideoChromeOptions("/opt/openvidu/fakevideo.y4m",
					"/opt/openvidu/fakeaudio.wav");
			capabilities = DesiredCapabilities.chrome();
			capabilities.setAcceptInsecureCerts(true);
			capabilities.setCapability(ChromeOptions.CAPABILITY, options);
			try {
				String instanceId = map.values().iterator().next().getInstanceId();
				if (this.amazonInstances.putIfAbsent(instanceId, map.get(instanceId)) == null) {
					// New instance id
					WebDriver driver = new RemoteWebDriver(new URL("http://" + map.get(instanceId).getIp() + URL_END),
							capabilities);
					browser = new ChromeBrowser(sessionId, userId, timeOfWaitInSeconds, driver);
				} else {
					// Existing instance id
					log.error("Amazon instance {} already configured. Returning existing Browser", instanceId);
					return null;
				}
			} catch (MalformedURLException e) {
				e.printStackTrace();
			}
			log.info("Using remote Chrome web driver");
			break;
		default:
			return this.getBrowser("chrome", sessionId, userId, timeOfWaitInSeconds);
		}
		return browser;
	}

	@Override
	public List<Browser> getBrowsers(int numberOfBrowsers, String browserType, String sessionId, List<String> userIds,
			int timeOfWaitInSeconds) {

		List<Browser> browsers = new ArrayList<>();
		Map<String, AmazonInstance> map = this.executor.launchBrowsers(numberOfBrowsers);

		DesiredCapabilities capabilities;

		switch (browserType) {
		case "chrome":
			ChromeOptions options = ChromeBrowser.generateFakeVideoChromeOptions("/opt/openvidu/fakevideo.y4m",
					"/opt/openvidu/fakeaudio.wav");
			capabilities = DesiredCapabilities.chrome();
			capabilities.setAcceptInsecureCerts(true);
			capabilities.setCapability(ChromeOptions.CAPABILITY, options);
			try {
				Iterator<String> it = map.keySet().iterator();
				String instanceId;
				int userIndex = 0;
				while (it.hasNext()) {
					instanceId = it.next();
					if (this.amazonInstances.putIfAbsent(instanceId, map.get(instanceId)) == null) {
						// New instance id
						WebDriver driver = new RemoteWebDriver(
								new URL("http://" + map.get(instanceId).getIp() + URL_END), capabilities);
						browsers.add(new ChromeBrowser(sessionId, userIds.get(userIndex), timeOfWaitInSeconds, driver));
						userIndex++;
					}
				}
			} catch (MalformedURLException e) {
				e.printStackTrace();
			}
			log.info("Using remote Chrome web drivers");
			break;
		default:
			return this.getBrowsers(numberOfBrowsers, "chrome", sessionId, userIds, timeOfWaitInSeconds);
		}
		return browsers;
	}

}
