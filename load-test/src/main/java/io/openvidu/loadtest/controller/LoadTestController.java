package io.openvidu.loadtest.controller;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.infrastructure.BrowserEmulatorClient;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.utils.JsonUtils;

/**
 * @author Carlos Santos
 *
 */

@Controller
public class LoadTestController {

	private static final Logger log = LoggerFactory.getLogger(LoadTestController.class);
	private static final int HTTP_STATUS_OK = 200;

	private static String SESSION_NAME_PREFIX = "LoadTestSession";
	private static String USER_NAME_PREFIX = "User";
	private static int SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS = 2;
	private static int SECONDS_TO_WAIT_BETWEEN_SESSIONS = 2;

	@Autowired
	private BrowserEmulatorClient browserEmulatorClient;

	@Autowired
	private JsonUtils jsonUtils;

	public void startLoadTests(List<TestCase> testCasesList) {

		testCasesList.forEach(testCase -> {

			if (testCase.is_NxN()) {

				for (int i = 0; i < testCase.getParticipants().size(); i++) {
					int participantsBySession = Integer.parseInt(testCase.getParticipants().get(i));
					System.out.println(participantsBySession);
					log.info("Starting test with N:N session typology");
					log.info("Each session will be composed by {} USERS", participantsBySession);

					this.startNxNTest(participantsBySession);
					this.getInfoAndClean();
				}
			} else if (testCase.is_1xN()) {
				this.start1xNTest(testCase.getParticipants());
			} else if (testCase.is_NxM()) {
				this.startNxMTest(testCase.getParticipants());
			} else if (testCase.is_TEACHING()) {
				this.startTeachingTest(testCase.getParticipants());
			} else {
				log.error("Test case has wrong typology, SKIPPED.");
				return;
			}

		});

	}

	private void startNxNTest(int participantsBySession) {
		AtomicInteger sessionNumber = new AtomicInteger(0);
		HttpResponse<String> response;
		boolean responseIsOk = true;

		while (responseIsOk) {
			sessionNumber.getAndIncrement();
			log.info("Starting session '{}'", SESSION_NAME_PREFIX + sessionNumber.get());
			for (int i = 0; i < participantsBySession; i++) {

				if (responseIsOk) {

					response = this.browserEmulatorClient.createPublisher(USER_NAME_PREFIX + i,
							SESSION_NAME_PREFIX + sessionNumber.get(), true, true);

					responseIsOk = checkSuccessResponse(response);

					try {
						Thread.sleep(SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS * 1000);
					} catch (InterruptedException e) {
						e.printStackTrace();
					}
				}
			}

			try {
				Thread.sleep(SECONDS_TO_WAIT_BETWEEN_SESSIONS * 1000);
			} catch (InterruptedException e) {
				e.printStackTrace();
			}
		}
	}

	private void start1xNTest(List<String> participants) {

	}

	private void startNxMTest(List<String> participants) {

	}

	private void startTeachingTest(List<String> participants) {

	}

	private void getInfoAndClean() {
		this.browserEmulatorClient.deleteAllStreamManagers("PUBLISHER");
		this.browserEmulatorClient.deleteAllStreamManagers("SUBSCRIBERS");
//		this.getAllMetrics();
//		this.restartOpenVidu();
//		this.restartCluster();

	}

	private boolean checkSuccessResponse(HttpResponse<String> response) {

		if (response.statusCode() == HTTP_STATUS_OK) {
			JsonObject jsonResponse = jsonUtils.getJson(response.body());
			String connectionId = jsonResponse.get("connectionId").getAsString();
			String workerCpu = jsonResponse.get("workerCpuUsage").getAsString();
			log.info("Connection {} created", connectionId);
			log.info("Worker CPU USAGE: {}% ", workerCpu);
			System.out.print("\n");
			return true;
		}
		log.error("Http Status Response {} ", response.statusCode());
		log.error("Response message {} ", response.body());
		return false;
	}

}
