package io.openvidu.loadtest;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Configuration;

import io.openvidu.loadtest.controller.LoadTestController;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.utils.DataIO;

/**
 * @author Carlos Santos
 *
 */

@SpringBootApplication
@Configuration
public class LoadTestApplication {

	private static final Logger log = LoggerFactory.getLogger(LoadTestApplication.class);

	public static void main(String[] args) {
		SpringApplication.run(LoadTestApplication.class, args);
		
		List<TestCase> testCasesList = new DataIO().getTestCasesFromJSON();
		
		System.out.println(testCasesList);
		
		if(testCasesList.size() > 0) {
			LoadTestController loadTestController = new LoadTestController(testCasesList);	
		} else {
			log.error("Test cases file not found or it is empty. Please, add test_case.json file in resources directory");
			
		}
		
	}

}
