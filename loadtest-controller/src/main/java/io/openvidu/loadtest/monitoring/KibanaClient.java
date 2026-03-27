package io.openvidu.loadtest.monitoring;

import java.io.File;
import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import java.nio.file.StandardCopyOption;
import java.io.InputStream;
import java.nio.file.Files;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import com.google.gson.JsonObject;
import com.google.gson.JsonArray;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

/**
 * @author Carlos Santos & Iván Chicano
 *
 */

@Service
public class KibanaClient {

    private static final String API_IMPORT_OBJECTS = "/api/saved_objects/_import?overwrite=true";
    private static final String API_EXPORT_SAVED_OBJECTS = "/api/saved_objects/_export";
    private static final String KIBANA_DASHBOARD_URL = "/app/kibana#/dashboard/";
    private static final String LOAD_TEST_DASHBOARD = "Load Test Dashboard";

    private static final String DASHBOARD_NOT_FOUND = "Kibana Load Test Dashboard is not found. You can import it manually to see the results if you provided an ElasticSearch instance.";

    private static final int HTTP_STATUS_OK = 200;

    private static final Logger log = LoggerFactory.getLogger(KibanaClient.class);

    private LoadTestConfig loadTestConfig;
    private CustomHttpClient httpClient;
    private ResourceLoader resourceLoader;
    private JsonUtils jsonUtils;

    private String kibanaHost;

    public KibanaClient(LoadTestConfig loadTestConfig, CustomHttpClient httpClient, ResourceLoader resourceLoader,
            JsonUtils jsonUtils) {
        this.loadTestConfig = loadTestConfig;
        this.httpClient = httpClient;
        this.resourceLoader = resourceLoader;
        this.jsonUtils = jsonUtils;
    }

    public void importDashboards() {
        if (this.loadTestConfig.isKibanaEstablished()) {

            try {
                this.kibanaHost = loadTestConfig.getKibanaHost().replaceAll("/$", "");
                log.info("Importing Kibana JSON file with saved objects from resources directory");
                Resource resource = resourceLoader.getResource("classpath:loadtest.ndjson");
                File file = resourceToFile(resource);
                importSavedObjects(file);
            } catch (Exception e) {
                log.warn("Can't import dashboard to Kibana at {}", this.kibanaHost);
                log.error(e.getMessage());
            }
            return;
        }
        log.warn("Kibana Host parameter is empty. Dashboard won't be imported.");
    }

    private File resourceToFile(Resource resource) throws IOException {
        try {
            return resource.getFile();
        } catch (Exception ex) {
            try (InputStream is = resource.getInputStream()) {
                File file = File.createTempFile("loadtest", ".ndjson");
                Files.copy(is, file.toPath(), StandardCopyOption.REPLACE_EXISTING);
                file.deleteOnExit();
                return file;
            }
        }
    }

    public String getDashboardUrl(String startTime, String endTime) {
        if (this.loadTestConfig.isKibanaEstablished()) {
            // Use the Export API instead of the deprecated _find endpoint.
            final String URL = this.loadTestConfig.getKibanaHost() + API_EXPORT_SAVED_OBJECTS;
            Map<String, String> headers = new HashMap<>();

            String esUserName = loadTestConfig.getElasticsearchUserName();
            String esPassword = loadTestConfig.getElasticsearchPassword();
            boolean securityEnabled = loadTestConfig.isElasticSearchSecured();
            if (securityEnabled) {
                headers.put("Authorization", getBasicAuth(esUserName, esPassword));
            }
            headers.put("kbn-xsrf", "true");

            try {
                JsonObject body = new JsonObject();
                body.addProperty("type", "dashboard");
                body.addProperty("search", LOAD_TEST_DASHBOARD);
                body.addProperty("excludeExportDetails", true);

                HttpResponse<String> response = this.httpClient.sendPost(URL, body, null, headers);

                if (response.statusCode() == HTTP_STATUS_OK) {
                    return extractDashboardUrlFromResponse(response, startTime, endTime);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.error("Interrupted while reaching Kibana REST API GET {}: {}", URL, e.getMessage());
                e.printStackTrace();
            } catch (IOException e) {
                log.error("Error while reaching Kibana REST API GET {}: {}", URL, e.getMessage());
                e.printStackTrace();
            }
        }

        return DASHBOARD_NOT_FOUND;

    }

    private String extractDashboardUrlFromResponse(HttpResponse<String> response, String startTime, String endTime) {
        // response is NDJSON (one JSON object per line). Parse first dashboard object.
        String[] lines = response.body().split("\\r?\\n");
        for (String line : lines) {
            if (line == null || line.trim().isEmpty()) {
                continue;
            }
            JsonObject obj = this.jsonUtils.getJson(line);
            if (obj.has("type") && "dashboard".equals(obj.get("type").getAsString()) && obj.has("id")) {
                String dashboardId = obj.get("id").getAsString();
                return this.loadTestConfig.getKibanaHost() + KIBANA_DASHBOARD_URL + dashboardId
                        + "?_g=(time:(from:'" + startTime + "',to:'" + endTime + "'))";
            }
        }
        return DASHBOARD_NOT_FOUND;
    }

    private void importSavedObjects(File file) throws IOException {
        final String URL = this.kibanaHost + API_IMPORT_OBJECTS;
        HttpResponse<String> response = null;
        Map<String, String> headers = new HashMap<>();

        // Basic auth header
        String esUserName = loadTestConfig.getElasticsearchUserName();
        String esPassword = loadTestConfig.getElasticsearchPassword();
        boolean securityEnabled = loadTestConfig.isElasticSearchSecured();
        if (securityEnabled) {
            headers.put("Authorization", getBasicAuth(esUserName, esPassword));
        }
        headers.put("kbn-xsrf", "true");

        try {
            response = this.httpClient.sendPost(URL, null, file, headers);
            this.processKibanaResponse(response);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while reaching Kibana REST API POST {}: {}", URL, e.getMessage());
            e.printStackTrace();
        }
    }

    private String getBasicAuth(String username, String password) {
        return "Basic " + Base64.getEncoder().encodeToString((username + ":" + password).getBytes());
    }

    private void processKibanaResponse(HttpResponse<String> response) {
        if (response.statusCode() == HTTP_STATUS_OK) {
            log.info("Kibana dashboards successfully imported");
        } else if (log.isErrorEnabled()) {
            log.error("Kibana response status {}. {}", response.statusCode(), response.body());
        }
    }

}
