package io.openvidu.loadtest.utils;

import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

@Component
public class ShutdownManager {

    private static final Logger log = LoggerFactory.getLogger(ShutdownManager.class);

    /**
     * How long a graceful shutdown is given before the JVM is halted. A bean
     * blocking in @PreDestroy (typically retrying against an endpoint that is
     * already gone) would otherwise keep the process alive forever.
     */
    static final Duration FORCED_EXIT_TIMEOUT = Duration.ofSeconds(60);

    private final ApplicationContext context;

    public ShutdownManager(ApplicationContext context) {
        this.context = context;
    }

    /**
     * Closes the application context and terminates the JVM with the given code.
     * <p>
     * SpringApplication.exit only closes the context and <em>returns</em> the exit
     * code; terminating is the caller's job. Without that, a run that ends early
     * (no test cases, not enough workers) left the process alive on any non-daemon
     * thread outliving the context, so a container never stopped and batch runners
     * waiting on it stalled indefinitely instead of moving on.
     */
    public void shutdownWithCode(int code) {
        armForcedExit(code);
        int exitCode = code;
        try {
            exitCode = SpringApplication.exit(context, () -> code);
        } catch (Exception e) {
            // Exiting matters more than exiting cleanly: a stuck shutdown must not
            // be indistinguishable from a test still running
            log.error("Error closing the application context. Exiting with code {} anyway", code, e);
        }
        exitJvm(exitCode);
    }

    /**
     * Starts a daemon watchdog that halts the JVM if the graceful shutdown does not
     * finish in time. Daemon so that it can never be the reason the JVM stays up.
     */
    private void armForcedExit(int code) {
        Thread watchdog = new Thread(() -> {
            try {
                Thread.sleep(forcedExitTimeout().toMillis());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            log.error("Shutdown did not complete in {}s. Halting the JVM with code {}",
                    forcedExitTimeout().toSeconds(), code);
            haltJvm(code);
        }, "loadtest-forced-exit");
        watchdog.setDaemon(true);
        watchdog.start();
    }

    /** Overridable so tests do not have to wait out the production timeout. */
    protected Duration forcedExitTimeout() {
        return FORCED_EXIT_TIMEOUT;
    }

    /** Overridable so tests can assert termination without killing the test JVM. */
    protected void exitJvm(int code) {
        System.exit(code);
    }

    /** Skips shutdown hooks on purpose: they are what is assumed to be stuck. */
    protected void haltJvm(int code) {
        Runtime.getRuntime().halt(code);
    }
}
