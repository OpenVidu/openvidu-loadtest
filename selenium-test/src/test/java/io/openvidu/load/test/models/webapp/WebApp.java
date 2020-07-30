package io.openvidu.load.test.models.webapp;

public abstract class WebApp {
    
    public enum WebAppType {
        CALL,
        CLASSROOM
    }
    
    protected String appUrl;
    
    protected String openviduUrl;
    
    public WebApp(String appUrl, String openviduUrl) {
        this.appUrl = appUrl;
        this.openviduUrl = openviduUrl;
    }
    
    public abstract String generateUrl(String sessionId, String userId, int userIndex);
}