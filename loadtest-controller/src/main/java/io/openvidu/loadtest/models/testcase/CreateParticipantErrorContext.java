package io.openvidu.loadtest.models.testcase;

public class CreateParticipantErrorContext {
    private final UserInfo userInfo;
    private final TestCase testCase;
    private final CreateParticipantResponse cpr;

    public CreateParticipantErrorContext(UserInfo userInfo, TestCase testCase, CreateParticipantResponse cpr) {
        this.userInfo = userInfo;
        this.testCase = testCase;
        this.cpr = cpr;
    }

    public TestCase getTestCase() {
        return testCase;
    }

    public CreateParticipantResponse getCpr() {
        return cpr;
    }

    public UserInfo getUserInfo() {
        return userInfo;
    }

}