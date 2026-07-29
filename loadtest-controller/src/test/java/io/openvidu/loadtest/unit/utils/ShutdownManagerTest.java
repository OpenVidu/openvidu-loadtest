package io.openvidu.loadtest.unit.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.boot.ExitCodeGenerator;
import org.springframework.context.ConfigurableApplicationContext;

import io.openvidu.loadtest.utils.ShutdownManager;

class ShutdownManagerTest {

    /** SpringApplication.exit looks up ExitCodeGenerator beans before closing. */
    private static ConfigurableApplicationContext contextMock() {
        ConfigurableApplicationContext context = mock(ConfigurableApplicationContext.class);
        when(context.getBeansOfType(ExitCodeGenerator.class)).thenReturn(Collections.emptyMap());
        return context;
    }

    /**
     * Records termination instead of performing it, so the assertions can run in
     * the test JVM.
     */
    private static class RecordingShutdownManager extends ShutdownManager {

        final List<Integer> exitCodes = new CopyOnWriteArrayList<>();
        final List<Integer> haltCodes = new CopyOnWriteArrayList<>();

        RecordingShutdownManager(ConfigurableApplicationContext context) {
            super(context);
        }

        @Override
        protected void exitJvm(int code) {
            exitCodes.add(code);
        }

        @Override
        protected void haltJvm(int code) {
            haltCodes.add(code);
        }
    }

    @Test
    void closesTheContextAndTerminatesTheJvm() {
        ConfigurableApplicationContext context = contextMock();
        RecordingShutdownManager manager = new RecordingShutdownManager(context);

        manager.shutdownWithCode(0);

        // Closing the context is not enough on its own: non-daemon threads (the
        // Elasticsearch REST client's I/O pool, for one) outlive it and keep the
        // process up, so the JVM has to be terminated explicitly
        verify(context).close();
        assertEquals(List.of(0), manager.exitCodes);
    }

    @Test
    void propagatesANonZeroExitCode() {
        ConfigurableApplicationContext context = contextMock();
        RecordingShutdownManager manager = new RecordingShutdownManager(context);

        manager.shutdownWithCode(1);

        // A batch runner distinguishes a failed run from a successful one by this
        // code, so it must survive the shutdown
        assertEquals(List.of(1), manager.exitCodes);
    }

    @Test
    void terminatesEvenWhenClosingTheContextThrows() {
        ConfigurableApplicationContext context = contextMock();
        doThrow(new IllegalStateException("bean destruction blew up")).when(context).close();
        RecordingShutdownManager manager = new RecordingShutdownManager(context);

        manager.shutdownWithCode(1);

        // A broken shutdown must still look like a finished run, not a hung one
        assertEquals(List.of(1), manager.exitCodes);
    }

    @Test
    void haltsTheJvmWhenTheGracefulShutdownNeverFinishes() throws Exception {
        ConfigurableApplicationContext context = contextMock();
        CountDownLatch halted = new CountDownLatch(1);
        RecordingShutdownManager manager = new RecordingShutdownManager(context) {
            @Override
            protected Duration forcedExitTimeout() {
                return Duration.ofMillis(50);
            }

            @Override
            protected void exitJvm(int code) {
                // Stand in for System.exit() blocking in a stuck shutdown hook
                try {
                    new CountDownLatch(1).await(10, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }

            @Override
            protected void haltJvm(int code) {
                super.haltJvm(code);
                halted.countDown();
            }
        };

        Thread caller = new Thread(() -> manager.shutdownWithCode(3));
        caller.setDaemon(true);
        caller.start();

        // A shutdown that never completes must not be indistinguishable from a
        // test still running, so the watchdog force-terminates the process
        assertTrue(halted.await(5, TimeUnit.SECONDS), "the watchdog should have halted the JVM");
        assertEquals(List.of(3), manager.haltCodes);
        caller.interrupt();
    }

    @Test
    void theWatchdogIsADaemonSoItCannotItselfKeepTheJvmUp() throws Exception {
        ConfigurableApplicationContext context = contextMock();
        CountDownLatch armed = new CountDownLatch(1);
        RecordingShutdownManager manager = new RecordingShutdownManager(context) {
            @Override
            protected void exitJvm(int code) {
                armed.countDown();
            }
        };

        manager.shutdownWithCode(0);
        assertTrue(armed.await(5, TimeUnit.SECONDS));

        Thread watchdog = Thread.getAllStackTraces().keySet().stream()
                .filter(t -> "loadtest-forced-exit".equals(t.getName()))
                .findFirst().orElse(null);
        assertTrue(watchdog != null, "a forced-exit watchdog should be armed");
        assertTrue(watchdog.isDaemon(), "the watchdog must never be the reason the JVM stays up");
    }
}
