package io.openvidu.loadtest.integration;

import org.junit.platform.launcher.LauncherSession;
import org.junit.platform.launcher.LauncherSessionListener;

/**
 * Cleans stale report artifacts once before the JUnit session executes tests.
 */
public class IntegrationTestLauncherSessionListener implements LauncherSessionListener {

    @Override
    public void launcherSessionOpened(LauncherSession session) {
        IntegrationTestReportCleaner.cleanTargetReportsOnce();
    }
}