package io.openvidu.loadtest.integration;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Cleans previously generated report artifacts once per integration test run.
 */
final class IntegrationTestReportCleaner {

    private static final Logger log = LoggerFactory.getLogger(IntegrationTestReportCleaner.class);

    private static final AtomicBoolean CLEANED = new AtomicBoolean(false);

    private static final List<Path> REPORT_DIRECTORIES = List.of(
            Path.of("target", "test-results"),
            Path.of("target", "surefire-reports"),
            Path.of("target", "failsafe-reports"),
            Path.of("target", "site", "jacoco"));

    private IntegrationTestReportCleaner() {
    }

    static void cleanTargetReportsOnce() {
        if (!CLEANED.compareAndSet(false, true)) {
            return;
        }

        for (Path reportDirectory : REPORT_DIRECTORIES) {
            deleteRecursivelyIfExists(reportDirectory);
        }
    }

    private static void deleteRecursivelyIfExists(Path path) {
        if (!Files.exists(path)) {
            return;
        }

        try (var paths = Files.walk(path)) {
            paths.sorted((a, b) -> b.compareTo(a)).forEach(current -> {
                try {
                    Files.deleteIfExists(current);
                } catch (IOException e) {
                    throw new UncheckedIOException("Failed to delete report artifact: " + current, e);
                }
            });
            log.info("Deleted previous integration test report artifacts from {}", path.toAbsolutePath());
        } catch (UncheckedIOException e) {
            throw e;
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to walk report artifacts path: " + path, e);
        }
    }
}