package io.openvidu.loadtest;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.EventListener;

import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.services.core.LoadTestService;
import io.openvidu.loadtest.utils.DataIO;
import io.openvidu.loadtest.utils.ShutdownManager;

/**
 * @author Carlos Santos & Iván Chicano
 *
 */

@SpringBootApplication
public class LoadTestApplication {

    private static final Logger log = LoggerFactory.getLogger(LoadTestApplication.class);
    private LoadTestService loadTestService;
    private DataIO io;
    private ShutdownManager shutdownManager;

    public LoadTestApplication(ShutdownManager shutdownManager, LoadTestService loadTestService, DataIO io) {
        this.shutdownManager = shutdownManager;
        this.loadTestService = loadTestService;
        this.io = io;
    }

    public static void main(String[] args) {
        SpringApplication.run(LoadTestApplication.class, args);
    }

    public void start() {
        List<TestCase> testCasesList = io.getTestCasesFromJSON();
        if (!testCasesList.isEmpty()) {
            loadTestService.startLoadTests(testCasesList);
            log.info("Finished");
            // Exit the application after all tests are completed
            shutdownManager.shutdownWithCode(0);
        } else {
            log.error(
                    "Test cases file not found or it is empty. Please, add test_case.json file in resources directory");
            // Exit with error code when no test cases are found
            shutdownManager.shutdownWithCode(1);
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void whenReady() {
        this.start();
    }

}
