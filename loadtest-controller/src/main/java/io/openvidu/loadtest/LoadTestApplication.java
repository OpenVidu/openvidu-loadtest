package io.openvidu.loadtest;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;

import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.services.LoadTestService;
import io.openvidu.loadtest.utils.DataIO;

/**
 * @author Carlos Santos & Iván Chicano
 *
 */

@SpringBootApplication
public class LoadTestApplication {

    private static final Logger log = LoggerFactory.getLogger(LoadTestApplication.class);

    private LoadTestService loadTestService;
    private DataIO io;

    public LoadTestApplication(LoadTestService loadTestService, DataIO io) {
        this.loadTestService = loadTestService;
        this.io = io;
    }

    public static void main(String[] args) {
        SpringApplication.run(LoadTestApplication.class, args);
    }

    public void start() throws Exception {
        List<TestCase> testCasesList = io.getTestCasesFromJSON();
        if (!testCasesList.isEmpty()) {
            loadTestService.startLoadTests(testCasesList);
            log.info("Finished");
        } else {
            log.error(
                    "Test cases file not found or it is empty. Please, add test_case.json file in resources directory");
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void whenReady() throws Exception {
        this.start();
    }

}
