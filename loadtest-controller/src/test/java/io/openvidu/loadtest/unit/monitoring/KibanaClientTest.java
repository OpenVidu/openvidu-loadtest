package io.openvidu.loadtest.unit.monitoring;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.net.ConnectException;
import java.net.http.HttpResponse;
import java.nio.file.Files;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.services.Sleeper;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

@ExtendWith(MockitoExtension.class)
class KibanaClientTest {

    private static final String KIBANA_HOST = "http://kibana:5601";
    private static final String STATUS_URL = KIBANA_HOST + "/api/status";
    private static final String IMPORT_URL = KIBANA_HOST + "/api/saved_objects/_import?overwrite=true";

    @Mock
    LoadTestConfig loadTestConfig;

    @Mock
    CustomHttpClient httpClient;

    @Mock
    ResourceLoader resourceLoader;

    @Mock
    JsonUtils jsonUtils;

    @Mock
    Sleeper sleeper;

    @InjectMocks
    KibanaClient client;

    @TempDir
    File tempDir;

    @BeforeEach
    void setUp() {
        client.maxRetries = 3;
    }

    private void givenKibanaConfigured() {
        when(loadTestConfig.isKibanaEstablished()).thenReturn(true);
        when(loadTestConfig.getKibanaHost()).thenReturn(KIBANA_HOST + "/");
    }

    private void givenDashboardResource() throws IOException {
        File ndjson = new File(tempDir, "loadtest.ndjson");
        Files.writeString(ndjson.toPath(), "{}\n");
        Resource resource = mock(Resource.class);
        when(resource.getFile()).thenReturn(ndjson);
        when(resourceLoader.getResource("classpath:loadtest.ndjson")).thenReturn(resource);
    }

    private HttpResponse<String> response(int statusCode) {
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(statusCode);
        return response;
    }

    @Test
    void testImportDashboards_whenKibanaNotConfigured_doesNothing() {
        when(loadTestConfig.isKibanaEstablished()).thenReturn(false);

        client.importDashboards();

        verifyNoInteractions(httpClient, sleeper);
    }

    @Test
    void testImportDashboards_whenKibanaReady_importsOnFirstAttempt() throws Exception {
        givenKibanaConfigured();
        givenDashboardResource();
        HttpResponse<String> ok = response(200);
        when(httpClient.sendGet(eq(STATUS_URL), anyMap())).thenReturn(ok);
        when(httpClient.sendPost(eq(IMPORT_URL), isNull(), any(File.class), anyMap())).thenReturn(ok);

        client.importDashboards();

        verify(httpClient, times(1)).sendGet(eq(STATUS_URL), anyMap());
        verify(httpClient, times(1)).sendPost(eq(IMPORT_URL), isNull(), any(File.class), anyMap());
        verifyNoInteractions(sleeper);
    }

    @Test
    void testImportDashboards_waitsUntilKibanaReadyBeforeImporting() throws Exception {
        givenKibanaConfigured();
        givenDashboardResource();
        HttpResponse<String> unavailable = response(503);
        HttpResponse<String> ok = response(200);
        when(httpClient.sendGet(eq(STATUS_URL), anyMap())).thenReturn(unavailable, unavailable, ok);
        when(httpClient.sendPost(eq(IMPORT_URL), isNull(), any(File.class), anyMap())).thenReturn(ok);

        client.importDashboards();

        verify(httpClient, times(3)).sendGet(eq(STATUS_URL), anyMap());
        // The import is only sent once Kibana reports ready, never during startup
        verify(httpClient, times(1)).sendPost(eq(IMPORT_URL), isNull(), any(File.class), anyMap());
        verify(sleeper, times(2)).sleep(anyInt(), eq("waiting for Kibana to be ready"));
    }

    @Test
    void testImportDashboards_treatsUnreachableKibanaAsNotReady() throws Exception {
        givenKibanaConfigured();
        givenDashboardResource();
        HttpResponse<String> ok = response(200);
        when(httpClient.sendGet(eq(STATUS_URL), anyMap()))
                .thenThrow(new ConnectException("Connection refused"))
                .thenReturn(ok);
        when(httpClient.sendPost(eq(IMPORT_URL), isNull(), any(File.class), anyMap())).thenReturn(ok);

        client.importDashboards();

        verify(httpClient, times(2)).sendGet(eq(STATUS_URL), anyMap());
        verify(httpClient, times(1)).sendPost(eq(IMPORT_URL), isNull(), any(File.class), anyMap());
    }

    @Test
    void testImportDashboards_whenKibanaNeverReady_neverSendsImport() throws Exception {
        givenKibanaConfigured();
        HttpResponse<String> unavailable = response(503);
        when(httpClient.sendGet(eq(STATUS_URL), anyMap())).thenReturn(unavailable);

        client.importDashboards();

        verify(httpClient, times(3)).sendGet(eq(STATUS_URL), anyMap());
        verify(httpClient, never()).sendPost(anyString(), any(), any(), anyMap());
        // No sleep after the last attempt
        verify(sleeper, times(2)).sleep(anyInt(), anyString());
    }

    @Test
    void testImportDashboards_retriesWhenImportFailsAfterKibanaReady() throws Exception {
        givenKibanaConfigured();
        givenDashboardResource();
        HttpResponse<String> ok = response(200);
        HttpResponse<String> serverError = response(500);
        when(serverError.body()).thenReturn("{\"statusCode\":500}");
        when(httpClient.sendGet(eq(STATUS_URL), anyMap())).thenReturn(ok);
        when(httpClient.sendPost(eq(IMPORT_URL), isNull(), any(File.class), anyMap()))
                .thenReturn(serverError, ok);

        client.importDashboards();

        verify(httpClient, times(2)).sendPost(eq(IMPORT_URL), isNull(), any(File.class), anyMap());
        verify(sleeper, times(1)).sleep(anyInt(), eq("retrying Kibana dashboard import"));
    }

    @Test
    void testImportDashboards_sendsAuthHeadersToStatusCheckWhenSecured() throws Exception {
        givenKibanaConfigured();
        givenDashboardResource();
        when(loadTestConfig.isElasticSearchSecured()).thenReturn(true);
        when(loadTestConfig.getElasticsearchUserName()).thenReturn("elastic");
        when(loadTestConfig.getElasticsearchPassword()).thenReturn("changeme");
        HttpResponse<String> ok = response(200);
        when(httpClient.sendGet(eq(STATUS_URL), anyMap())).thenReturn(ok);
        when(httpClient.sendPost(eq(IMPORT_URL), isNull(), any(File.class), anyMap())).thenReturn(ok);

        client.importDashboards();

        verify(httpClient).sendGet(eq(STATUS_URL),
                argThat(headers -> headers.get("Authorization") != null
                        && headers.get("Authorization").startsWith("Basic ")
                        && "true".equals(headers.get("kbn-xsrf"))));
    }
}
