package io.openvidu.loadtest.controller;

import java.net.http.HttpResponse;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.infrastructure.BrowserEmulatorClient;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.utils.JsonUtils;

/**
 * @author Carlos Santos
 *
 */

@Controller
public class LoadTestController {

	private static final Logger log = LoggerFactory.getLogger(LoadTestController.class);
	private static final int HTTP_STATUS_OK = 200;

	@Autowired
	private BrowserEmulatorClient browserEmulatorClient;
	
	@Autowired
	private LoadTestConfig loadTestConfig;
	
	@Autowired
	private KibanaClient kibanaClient;
	
	@Autowired
	private JsonUtils jsonUtils;
	
	private Calendar startTime;
	private static final SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
	private static final int TEN_MINUTES = 10;


	public void startLoadTests(List<TestCase> testCasesList) {
		this.kibanaClient.importDashboards();
		this.startTime = Calendar.getInstance();
		// Subtract ten minutes because of Kibana time filter
		this.startTime.add(Calendar.MINUTE, -TEN_MINUTES);

		testCasesList.forEach(testCase -> {

			if (testCase.is_NxN()) {

				for (int i = 0; i < testCase.getParticipants().size(); i++) {
					int participantsBySession = Integer.parseInt(testCase.getParticipants().get(i));
					log.info("Starting test with N:N session typology");
					log.info("Each session will be composed by {} USERS", participantsBySession);

					this.startNxNTest(participantsBySession);
					this.cleanEnvironment();
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
		
		this.showLoadTestReport();

	}

	private void startNxNTest(int participantsBySession) {
		AtomicInteger sessionNumber = new AtomicInteger(0);
		HttpResponse<String> response;
		boolean responseIsOk = true;

		while (responseIsOk) {
			sessionNumber.getAndIncrement();
			log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumber.get());
			for (int i = 0; i < participantsBySession; i++) {

				if (responseIsOk) {

					response = this.browserEmulatorClient.createPublisher(loadTestConfig.getUserNamePrefix() + i,
							loadTestConfig.getSessionNamePrefix() + sessionNumber.get(), true, true);

					responseIsOk = processResponse(response);

					try {
						log.info("Waiting {} seconds between participants", loadTestConfig.getSecondsToWaitBetweenParticipants());
						Thread.sleep(loadTestConfig.getSecondsToWaitBetweenParticipants() * 1000);
					} catch (InterruptedException e) {
						e.printStackTrace();
					}
				}
			}

			try {
				log.info("Waiting {} seconds between session", loadTestConfig.getSecondsToWaitBetweenSession());
				Thread.sleep(loadTestConfig.getSecondsToWaitBetweenSession() * 1000);
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

	public void cleanEnvironment() {
		this.browserEmulatorClient.deleteAllStreamManagers("PUBLISHER");
		this.browserEmulatorClient.deleteAllStreamManagers("SUBSCRIBERS");

	}
	
	private void showLoadTestReport() {
		Calendar endCalendarTime = Calendar.getInstance();
		endCalendarTime.add(Calendar.MINUTE, TEN_MINUTES);

		String startTime = formatter.format(this.startTime.getTime()).replace(" ", "T");
		String endTime = formatter.format(endCalendarTime.getTime()).replace(" ", "T");
		
		String url = this.kibanaClient.getDashboardUrl(startTime, endTime);
		log.info("Load Test finished.");
		log.info("Kibana Dashboard Report: {} ", url);
	}
	
	private boolean processResponse(HttpResponse<String> response) {

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
