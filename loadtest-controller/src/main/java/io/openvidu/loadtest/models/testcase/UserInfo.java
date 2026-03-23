package io.openvidu.loadtest.models.testcase;

public class UserInfo {
    private final String workerUrl;
    private final int userNumber;
    private final int sessionNumber;
    private final Role role;
    private final String userId;
    private final String sessionId;

    public UserInfo(String workerUrl, int userNumber, int sessionNumber, Role role, String userId, String sessionId) {
        this.workerUrl = workerUrl;
        this.userNumber = userNumber;
        this.sessionNumber = sessionNumber;
        this.role = role;
        this.userId = userId;
        this.sessionId = sessionId;
    }

    public String getWorkerUrl() {
        return workerUrl;
    }

    public int getUserNumber() {
        return userNumber;
    }

    public int getSessionNumber() {
        return sessionNumber;
    }

    public Role getRole() {
        return role;
    }

    public String getUserId() {
        return userId;
    }

    public String getSessionId() {
        return sessionId;
    }

}
