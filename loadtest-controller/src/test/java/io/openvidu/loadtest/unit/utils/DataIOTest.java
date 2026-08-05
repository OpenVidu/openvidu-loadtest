package io.openvidu.loadtest.unit.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Calendar;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.core.env.Environment;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.EgressConfig;
import io.openvidu.loadtest.models.testcase.EgressType;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.Topology;
import io.openvidu.loadtest.utils.DataIO;
import io.openvidu.loadtest.utils.HtmlReportGenerator;
import io.openvidu.loadtest.utils.ResultExporter;

class DataIOTest {

    @Mock
    private Environment env;
    @Mock
    private ResultExporter resultExporter;
    @Mock
    private LoadTestConfig loadTestConfig;
    @Mock
    private HtmlReportGenerator htmlReportGenerator;

    private DataIO dataIO;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        dataIO = new DataIO(env, resultExporter, loadTestConfig, htmlReportGenerator);
    }

    @Test
    void testGetTestCasesFromJSON_fromFile(@TempDir Path tempDir) throws IOException {
        String yaml = """
                testcases:
                  - topology: N:N
                    sessions: 2
                    participants:
                      - "2"
                      - "8"
                    frameRate: 30
                    resolution: 1280x720
                    startingParticipants: 1
                    recording: false
                    headless: false
                    showBrowserVideoElements: true
                    browser: chrome
                """;

        Path cfg = tempDir.resolve("config.yaml");
        Files.writeString(cfg, yaml);

        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn(cfg.toString());

        List<TestCase> cases = dataIO.getTestCasesFromJSON();

        assertEquals(1, cases.size(), "Should load one test case");
        TestCase tc = cases.get(0);
        assertEquals(Topology.N_X_N.getValue(), tc.getTopology().getValue());
        assertEquals(2, tc.getParticipants().size());
        assertEquals(30, tc.getFrameRate());
    }

    @Test
    void testGetTestCasesFromJSON_customEmulatedBrowser(@TempDir Path tempDir) throws IOException {
        String yaml = """
                testcases:
                  - topology: N:N
                    sessions: 1
                    participants:
                      - "4"
                    browser: custom-emulated
                """;

        Path cfg = tempDir.resolve("config.yaml");
        Files.writeString(cfg, yaml);

        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn(cfg.toString());

        List<TestCase> cases = dataIO.getTestCasesFromJSON();

        assertEquals(1, cases.size(), "Should load one test case");
        TestCase tc = cases.get(0);
        assertEquals(Browser.CUSTOM_EMULATED, tc.getBrowser(), "Browser should be custom-emulated");
    }

    @Test
    void testGetTestCasesFromJSON_defaultsToChromeBrowser(@TempDir Path tempDir) throws IOException {
        String yaml = """
                testcases:
                  - topology: N:N
                    sessions: 1
                    participants:
                      - "2"
                """;

        Path cfg = tempDir.resolve("config.yaml");
        Files.writeString(cfg, yaml);

        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn(cfg.toString());

        List<TestCase> cases = dataIO.getTestCasesFromJSON();

        TestCase tc = cases.get(0);
        assertEquals(Browser.CHROME, tc.getBrowser(), "Browser should default to chrome");
        assertFalse(tc.isSimulcast(), "Simulcast should default to false");
        assertEquals("", tc.getVideoCodec());
        assertEquals("", tc.getLayout());
    }

    @Test
    void testGetTestCasesFromJSON_emulatedBrowser(@TempDir Path tempDir) throws IOException {
        String yaml = """
                testcases:
                  - topology: ONE_SESSION_NXM
                    sessions: 1
                    participants:
                      - "10:5"
                    browser: emulated
                    videoCodec: h264
                    simulcast: true
                    layout: 4x4
                """;

        Path cfg = tempDir.resolve("config.yaml");
        Files.writeString(cfg, yaml);

        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn(cfg.toString());

        List<TestCase> cases = dataIO.getTestCasesFromJSON();

        assertEquals(1, cases.size(), "Should load one test case");
        TestCase tc = cases.get(0);
        assertEquals(Browser.EMULATED, tc.getBrowser(), "Browser should be emulated");
        assertTrue(tc.isLoadTestMode());
        assertEquals("h264", tc.getVideoCodec());
        assertEquals(true, tc.isSimulcast());
        assertEquals("4x4", tc.getLayout());
    }

    /** Loads a single test case from an inline testcases YAML snippet. */
    private TestCase loadSingleTestCase(Path tempDir, String testCaseYaml) throws IOException {
        Path cfg = tempDir.resolve("config.yaml");
        Files.writeString(cfg, "testcases:\n" + testCaseYaml);
        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn(cfg.toString());
        List<TestCase> cases = dataIO.getTestCasesFromJSON();
        assertEquals(1, cases.size(), "Should load one test case");
        return cases.get(0);
    }

    @Test
    void emulatedResolutionAcceptsTheDocumentedQualityNames(@TempDir Path tempDir) throws IOException {
        TestCase low = loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: emulated
                    resolution: low
                """);

        assertEquals("low", low.getEmulatedResolution());
    }

    @Test
    void emulatedResolutionMapsPixelResolutionsToTheClosestPreset(@TempDir Path tempDir) throws IOException {
        assertEquals("medium", loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: emulated
                    resolution: 640x480
                """).getEmulatedResolution());

        assertEquals("high", loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: emulated
                    resolution: 1280x720
                """).getEmulatedResolution());
    }

    @Test
    void emulatedResolutionCaps1080pAtTheHighestAvailablePreset(@TempDir Path tempDir) throws IOException {
        // Emulated mode replays clips that stop at 720p
        assertEquals("high", loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: emulated
                    resolution: 1920x1080
                """).getEmulatedResolution());
    }

    @Test
    void customEmulated1080pKeepsItsPixelResolution(@TempDir Path tempDir) throws IOException {
        // The emulated-preset mapping (and its "capped to high" warning) must
        // not run for other browsers: custom-emulated legitimately publishes
        // 1920x1080 through the pixel Resolution, not the coarse presets.
        TestCase tc = loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: custom-emulated
                    resolution: 1920x1080
                """);

        assertEquals(Resolution.FULLHIGH, tc.getResolution());
        // Untouched default; the emulated preset is only meaningful for browser 'emulated'
        assertEquals("high", tc.getEmulatedResolution());
    }

    @Test
    void emulatedResolutionDefaultsToHigh(@TempDir Path tempDir) throws IOException {
        assertEquals("high", loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: emulated
                """).getEmulatedResolution());
    }

    @Test
    void realBrowserFallsBackTo640x480OnAnUnrecognizedResolution(@TempDir Path tempDir) throws IOException {
        // A real browser needs a pixel resolution, so a quality name is not usable
        // and the documented fallback applies (this one does warn, unlike emulated)
        TestCase tc = loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: chrome
                    resolution: high
                """);

        assertEquals(Resolution.MEDIUM, tc.getResolution());
    }

    @Test
    void realBrowserVideoCodecAcceptsVp9AndAv1(@TempDir Path tempDir) throws IOException {
        // Real browsers accept a wider codec set than emulated mode, applied as
        // the LiveKit client's preferred publish codec
        assertEquals("vp9", loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: chrome
                    videoCodec: vp9
                """).getVideoCodec());

        assertEquals("av1", loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: firefox
                    videoCodec: av1
                """).getVideoCodec());
    }

    @Test
    void emulatedVideoCodecRejectsVp9AndAv1(@TempDir Path tempDir) throws IOException {
        // lk load-test only understands h264/vp8; anything else is ignored
        assertEquals("", loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: emulated
                    videoCodec: vp9
                """).getVideoCodec());
    }

    @Test
    void customEmulatedVideoCodecIsAlwaysForcedToH264(@TempDir Path tempDir) throws IOException {
        // The custom-emulated publish pipeline is hardcoded to h264 regardless of
        // what is configured here
        assertEquals("h264", loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: custom-emulated
                    videoCodec: vp8
                """).getVideoCodec());

        assertEquals("h264", loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: custom-emulated
                """).getVideoCodec());
    }

    @Test
    void publishersAlsoSubscribeDefaultsToTrue(@TempDir Path tempDir) throws IOException {
        assertTrue(loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: emulated
                """).isPublishersAlsoSubscribe());
    }

    @Test
    void publishersAlsoSubscribeCanBeDisabled(@TempDir Path tempDir) throws IOException {
        assertFalse(loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: emulated
                    publishersAlsoSubscribe: false
                """).isPublishersAlsoSubscribe());
    }

    @Test
    void noEgressBlockMeansNoRecording(@TempDir Path tempDir) throws IOException {
        TestCase tc = loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["4"]
                    browser: emulated
                """);

        assertFalse(tc.getEgress().isEnabled());
        assertEquals(EgressType.NONE, tc.getEgress().getType());
    }

    @Test
    void egressBlockIsParsedInFull(@TempDir Path tempDir) throws IOException {
        TestCase tc = loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["8"]
                    sessions: 8
                    browser: emulated
                    egress:
                      type: ROOM_COMPOSITE
                      rooms: 4
                      startAfterSeconds: 60
                      preset: H264_1080P_30
                      layout: speaker
                      audioOnly: false
                      fileType: MP4
                      filePrefix: s9a
                """);

        EgressConfig egress = tc.getEgress();
        assertTrue(egress.isEnabled());
        assertEquals(EgressType.ROOM_COMPOSITE, egress.getType());
        assertEquals(4, egress.getRooms());
        assertEquals(60, egress.getStartAfterSeconds());
        assertEquals("H264_1080P_30", egress.getPreset());
        assertEquals("speaker", egress.getLayout());
        assertFalse(egress.isAudioOnly());
        assertEquals("MP4", egress.getFileType());
        assertEquals("s9a", egress.getFilePrefix());
    }

    @Test
    void egressDefaultsAreFilledIn(@TempDir Path tempDir) throws IOException {
        TestCase tc = loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["8"]
                    browser: emulated
                    egress:
                      type: track
                """);

        EgressConfig egress = tc.getEgress();
        assertEquals(EgressType.TRACK, egress.getType(), "type should be case-insensitive");
        assertEquals(0, egress.getRooms(), "0 means every room");
        assertEquals(1, egress.getJobsPerRoom());
        assertEquals(0, egress.getStartAfterSeconds());
        assertEquals("grid", egress.getLayout());
        assertEquals("loadtest", egress.getFilePrefix());
    }

    @Test
    void unrecognizedEgressTypeDisablesRecording(@TempDir Path tempDir) throws IOException {
        TestCase tc = loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["8"]
                    browser: emulated
                    egress:
                      type: WEB_EGRESS
                """);

        assertFalse(tc.getEgress().isEnabled());
    }

    @Test
    void egressJobsPerRoomIsIgnoredForRoomComposite(@TempDir Path tempDir) throws IOException {
        TestCase tc = loadSingleTestCase(tempDir, """
                  - topology: N:N
                    participants: ["8"]
                    browser: emulated
                    egress:
                      type: ROOM_COMPOSITE
                      jobsPerRoom: 4
                """);

        // A room composite produces one output for the whole room
        assertEquals(1, tc.getEgress().getJobsPerRoom());
    }

    @Test
    void testExportResults_writesResultsFile(@TempDir Path tempDir) throws IOException {
        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn("nonexistent.yaml");
        when(loadTestConfig.getReportOutput()).thenReturn(Arrays.asList("txt")); // Only txt output

        // Mock ResultExporter to write into our temp directory and return its path
        when(resultExporter.export(any(), anyString())).thenAnswer(invocation -> {
            ResultReport r = invocation.getArgument(0);
            String fname = invocation.getArgument(1);
            Files.writeString(tempDir.resolve(fname), r.toString());
            return tempDir.resolve(fname).toString();
        });

        // Prepare a minimal ResultReport with start/end times and some values
        ResultReport report = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(2)
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());
        String timestamp = "2026-04-14_10-30-00";
        dataIO.exportResultsTxtOnly(report, timestamp);

        Path resultFile = tempDir.resolve("results-" + timestamp + ".txt");
        assertTrue(Files.exists(resultFile), "results.txt should be created in RESULTS_DIR");

        String content = Files.readString(resultFile);
        assertTrue(content.contains("Number of participants created: 5"), "Content should include participants count");
        verify(resultExporter).export(report, "results-2026-04-14_10-30-00.txt");
        verify(htmlReportGenerator, never()).generateHtmlReport(any(), anyString());
    }

    @Test
    void testExportResults_doesNotGenerateHtmlReportWhenDisabled(@TempDir Path tempDir) throws IOException {
        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn("nonexistent.yaml");
        when(loadTestConfig.getReportOutput()).thenReturn(Arrays.asList("txt"));

        when(resultExporter.export(any(), anyString())).thenReturn(tempDir.resolve("results-2026-04-14_10-30-00.txt").toString());

        ResultReport report = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(2)
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());
        String timestamp = "2026-04-14_10-30-00";
        dataIO.exportResultsTxtOnly(report, timestamp);

        verify(resultExporter).export(report, "results-2026-04-14_10-30-00.txt");
        verify(htmlReportGenerator, never()).generateHtmlReport(any(), anyString());
    }

}