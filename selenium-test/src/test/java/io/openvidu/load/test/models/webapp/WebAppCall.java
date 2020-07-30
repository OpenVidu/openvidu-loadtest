package io.openvidu.load.test.models.webapp;

public class WebAppCall extends WebApp {

    private String openViduSecret;
    
    public WebAppCall(String appUrl, String openViduUrl, String openViduSecret) {
        super(appUrl, openViduUrl);
        this.openViduSecret = openViduSecret;
    }
    
    @Override
    public String generateUrl(String sessionId, String userId,  int userIndex) {
        return this.appUrl + "?publicurl=" + this.openviduUrl + "&secret=" + this.openViduSecret + "&sessionId="
					+ sessionId + "&userId=" + userId;
    }
    
}