package io.openvidu.loadtest.utils;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Component;

import io.openvidu.loadtest.models.testcase.ResultReport;

@Component
public class ResultExporter {

    private static final Logger log = LoggerFactory.getLogger(ResultExporter.class);

    public String export(ResultReport result, String fileName) throws IOException {
        String resultsDir = System.getenv("RESULTS_DIR");
        if (resultsDir == null || resultsDir.isBlank()) {
            resultsDir = System.getProperty("RESULTS_DIR");
        }
        String resultPath;

        if (resultsDir != null && !resultsDir.isBlank()) {
            File dir = new File(resultsDir);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            resultPath = new File(dir, fileName).getAbsolutePath();
        } else {
            resultPath = new FileSystemResource(fileName).getFile().getAbsolutePath();
        }

        try (FileWriter fw = new FileWriter(resultPath, true);
                BufferedWriter bw = new BufferedWriter(fw)) {
            bw.write(result.toString());
            bw.newLine();
            bw.newLine();
        }
        log.info("Saved result in {}", resultPath);
        return resultPath;
    }
}
