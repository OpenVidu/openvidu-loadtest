package io.openvidu.loadtest.services.core;

import java.util.Calendar;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.UserInfo;
import io.openvidu.loadtest.services.BrowserEmulatorClient;

class LoadTestParticipantTask implements Supplier<CreateParticipantResponse> {
    private static final Logger log = LoggerFactory.getLogger(LoadTestParticipantTask.class);
    private final LoadTestParticipantOrchestrator loadTestParticipantOrchestrator;
    private final BrowserEmulatorClient browserEmulatorClient;
    private UserInfo userInfo;
    private TestCase testCase;
    private boolean recording;
    private String recordingMetadata;

    public LoadTestParticipantTask(LoadTestParticipantOrchestrator loadTestParticipantOrchestrator,
            BrowserEmulatorClient browserEmulatorClient,
            UserInfo userInfo, TestCase testCase, boolean recording, String recordingMetadata) {
        this.loadTestParticipantOrchestrator = loadTestParticipantOrchestrator;
        this.browserEmulatorClient = browserEmulatorClient;
        this.userInfo = userInfo;
        this.testCase = testCase;
        this.recording = recording;
        this.recordingMetadata = recordingMetadata;
    }

    @Override
    public CreateParticipantResponse get() {
        CreateParticipantResponse response;
        if (recording) {
            if (this.userInfo.getRole().equals(Role.PUBLISHER)) {
                response = this.browserEmulatorClient.createExternalRecordingPublisher(
                        this.userInfo.getWorkerUrl(), this.userInfo.getUserNumber(),
                        this.userInfo.getSessionNumber(), testCase, recordingMetadata);
            } else {
                response = this.browserEmulatorClient.createExternalRecordingSubscriber(
                        this.userInfo.getWorkerUrl(), this.userInfo.getUserNumber(),
                        this.userInfo.getSessionNumber(), testCase, recordingMetadata);
            }
        } else {
            if (this.userInfo.getRole().equals(Role.PUBLISHER)) {
                response = this.browserEmulatorClient.createPublisher(this.userInfo.getWorkerUrl(),
                        this.userInfo.getUserNumber(), this.userInfo.getSessionNumber(), testCase);
            } else {
                response = this.browserEmulatorClient.createSubscriber(this.userInfo.getWorkerUrl(),
                        this.userInfo.getUserNumber(), this.userInfo.getSessionNumber(), testCase);
            }
        }
        if (response.isResponseOk()) {
            Calendar startTime = Calendar.getInstance();
            this.loadTestParticipantOrchestrator.incrementAndGetTotalParticipants();
            this.loadTestParticipantOrchestrator.addUserStartTime(startTime, response.getSessionId(),
                    response.getUserId());
        } else {
            log.error("Response status is not 200 OK. Exit");
        }
        this.loadTestParticipantOrchestrator.addParticipantResponse(response);
        return response;
    }
}