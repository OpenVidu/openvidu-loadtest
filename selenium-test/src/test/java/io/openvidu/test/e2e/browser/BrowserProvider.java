package io.openvidu.test.e2e.browser;

public interface BrowserProvider {
	
	Browser getBrowser(String browserType, String clientData, int timeOfWaitInSeconds);

}
