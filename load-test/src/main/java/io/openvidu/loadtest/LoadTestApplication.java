package io.openvidu.loadtest;

import java.util.List;

import javax.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import io.openvidu.loadtest.controller.LoadTestController;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.utils.DataIO;

/**
 * @author Carlos Santos
 *
 */

@SpringBootApplication
public class LoadTestApplication {

	private static final Logger log = LoggerFactory.getLogger(LoadTestApplication.class);

	@Autowired
	private LoadTestController loadTestController;

	@Autowired
	private DataIO io;

	public static void main(String[] args) {
		SpringApplication.run(LoadTestApplication.class, args);

	}

	@PostConstruct
	public void start() {

		List<TestCase> testCasesList = io.getTestCasesFromJSON();
		if (testCasesList.size() > 0) {
			loadTestController.startLoadTests(testCasesList);
		} else {
			log.error(
					"Test cases file not found or it is empty. Please, add test_case.json file in resources directory");

		}
	}

}
