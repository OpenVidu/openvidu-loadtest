package io.openvidu.load.test.browser;

import java.util.List;

public interface BrowserProvider {

	Browser getBrowser(String browserType, String sessionId, String userId, int timeOfWaitInSeconds);

	/*
	 * Sync method. Until all WebDrivers are not ready this method shouldn't return
	 */
	List<Browser> getBrowsers(int numberOfBrowsers, String browserType, String sessionId, List<String> clientData,
			int timeOfWaitInSeconds) throws BrowserNotReadyException;

}
