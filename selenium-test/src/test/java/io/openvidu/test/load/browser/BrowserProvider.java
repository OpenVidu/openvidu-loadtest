package io.openvidu.test.load.browser;

public interface BrowserProvider {
	
	Browser getBrowser(String browserType, String clientData, int timeOfWaitInSeconds);

}
