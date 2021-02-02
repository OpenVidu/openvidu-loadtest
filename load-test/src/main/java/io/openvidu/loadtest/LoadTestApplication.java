package io.openvidu.loadtest;

import javax.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.utils.DataIO;

/**
 * @author Carlos Santos
 *
 */

@SpringBootApplication
public class LoadTestApplication {

	private static final Logger log = LoggerFactory.getLogger(LoadTestApplication.class);

//	@Autowired
//	private LoadTestController loadTestController;

	@Autowired
	private DataIO io;
	
	@Autowired
	private KibanaClient kibanaClient;

	public static void main(String[] args) {
		SpringApplication.run(LoadTestApplication.class, args);
	}

	@PostConstruct
	public void start() {
		
		this.kibanaClient.importDashboards();
		
//		List<TestCase> testCasesList = io.getTestCasesFromJSON();
//		if (testCasesList.size() > 0) {
//			loadTestController.startLoadTests(testCasesList);
//		} else {
//			log.error(
//					"Test cases file not found or it is empty. Please, add test_case.json file in resources directory");
//
//		}
	}

}
