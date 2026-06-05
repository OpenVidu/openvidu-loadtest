package io.openvidu.loadtest.integration;

import java.util.List;
import java.time.Duration;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.test.context.DynamicPropertyRegistry;

import io.floci.testcontainers.FlociContainer;
import io.openvidu.loadtest.integration.mock.BrowserEmulatorMockServer;
import io.openvidu.loadtest.integration.mock.ReconnectionFailureSimulator;
import io.openvidu.loadtest.integration.mock.WebSocketMockServer;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ec2.model.AuthorizeSecurityGroupIngressRequest;
import software.amazon.awssdk.services.ec2.model.CreateSecurityGroupRequest;
import software.amazon.awssdk.services.ec2.model.CreateSecurityGroupResponse;
import software.amazon.awssdk.services.ec2.model.IpPermission;
import software.amazon.awssdk.services.ec2.model.IpRange;
import software.amazon.awssdk.services.ec2.model.RegisterImageRequest;
import software.amazon.awssdk.services.ec2.model.RegisterImageResponse;

/**
 * Shared integration test environment helper.
 *
 * Provides methods to start mock servers, register dynamic properties, and
 * provision Floci security groups / AMIs used by the AWS integration tests.
 */
public class IntegrationTestEnvironment {

    private static final Logger log = LoggerFactory.getLogger(IntegrationTestEnvironment.class);

    public static BrowserEmulatorMockServer browserEmulatorMock;
    public static WebSocketMockServer webSocketMockServer;
    public static ReconnectionFailureSimulator failureSimulator;
    public static String createdSecurityGroupId;
    public static String createdAmiId;

    public static synchronized void configureFlociAndStartMocks(DynamicPropertyRegistry registry, FlociContainer floci,
            String securityGroupName, String amiName, String failUser, String failSession) {
        startMocksInternal(floci, securityGroupName, amiName, failUser, failSession);

        String ec2Endpoint = floci.getEndpoint() + "/";
        registry.add("aws.endpointOverride", () -> ec2Endpoint);
        registry.add("workers.http.port", () -> browserEmulatorMock.getPort());
        registry.add("workers.websocket.port", () -> webSocketMockServer.getPort());
        registry.add("aws.securityGroupId", () -> createdSecurityGroupId);
        registry.add("aws.amiId", () -> createdAmiId);
    }

    public static synchronized void startMocksIfNeeded(FlociContainer floci, String securityGroupName, String amiName,
            String failUser, String failSession) {
        if (browserEmulatorMock == null || webSocketMockServer == null || failureSimulator == null) {
            startMocksInternal(floci, securityGroupName, amiName, failUser, failSession);

            if (browserEmulatorMock != null) {
                System.setProperty("workers.http.port", String.valueOf(browserEmulatorMock.getPort()));
            }
            if (webSocketMockServer != null) {
                System.setProperty("workers.websocket.port", String.valueOf(webSocketMockServer.getPort()));
            }
            if (createdSecurityGroupId != null) {
                System.setProperty("aws.securityGroupId", createdSecurityGroupId);
            }
            if (createdAmiId != null) {
                System.setProperty("aws.amiId", createdAmiId);
            }
        }
    }

    private static void startMocksInternal(FlociContainer floci, String securityGroupName, String amiName,
            String failUser, String failSession) {
        try {
            String ec2Endpoint = floci.getEndpoint() + "/";

            if (failureSimulator == null) {
                if (failUser != null && failSession != null) {
                    failureSimulator = new ReconnectionFailureSimulator(failUser, failSession);
                } else {
                    failureSimulator = new ReconnectionFailureSimulator();
                }
            }

            if (browserEmulatorMock == null) {
                browserEmulatorMock = new BrowserEmulatorMockServer(0, failureSimulator);
                browserEmulatorMock.startHttps();
                log.info("Browser emulator mock server started on HTTPS port {}", browserEmulatorMock.getPort());
            }

            if (webSocketMockServer == null) {
                webSocketMockServer = new WebSocketMockServer(0);
                webSocketMockServer.start();
                browserEmulatorMock.setWebSocketServer(webSocketMockServer);
            }

            var setupClient = software.amazon.awssdk.services.ec2.Ec2Client.builder()
                    .region(Region.US_EAST_1)
                    .endpointOverride(java.net.URI.create(ec2Endpoint))
                    .credentialsProvider(StaticCredentialsProvider.create(
                            AwsBasicCredentials.create("test", "test")))
                    .build();

            try {
                CreateSecurityGroupResponse sgResponse = setupClient.createSecurityGroup(
                        CreateSecurityGroupRequest.builder()
                                .groupName(securityGroupName)
                                .description("Test security group for OpenVidu load testing")
                                .build());
                createdSecurityGroupId = sgResponse.groupId();
                log.info("Created security group: {}", createdSecurityGroupId);

                List<IpPermission> permissions = List.of(
                        IpPermission.builder()
                                .ipProtocol("tcp")
                                .fromPort(browserEmulatorMock.getPort())
                                .toPort(browserEmulatorMock.getPort())
                                .ipRanges(IpRange.builder().cidrIp("0.0.0.0/0").build())
                                .build(),
                        IpPermission.builder()
                                .ipProtocol("tcp")
                                .fromPort(webSocketMockServer.getPort())
                                .toPort(webSocketMockServer.getPort())
                                .ipRanges(IpRange.builder().cidrIp("0.0.0.0/0").build())
                                .build());

                try {
                    setupClient.authorizeSecurityGroupIngress(
                            AuthorizeSecurityGroupIngressRequest.builder()
                                    .groupId(createdSecurityGroupId)
                                    .ipPermissions(permissions)
                                    .build());
                    log.info("Authorized inbound traffic for specific mock server ports: {}, {}",
                            browserEmulatorMock.getPort(), webSocketMockServer.getPort());
                } catch (Exception e) {
                    log.warn("Authorizing specific ports failed ({}), falling back to 4000-6000", e.getMessage());
                    setupClient.authorizeSecurityGroupIngress(
                            AuthorizeSecurityGroupIngressRequest.builder()
                                    .groupId(createdSecurityGroupId)
                                    .ipPermissions(
                                            IpPermission.builder()
                                                    .ipProtocol("tcp")
                                                    .fromPort(4000)
                                                    .toPort(6000)
                                                    .ipRanges(IpRange.builder().cidrIp("0.0.0.0/0").build())
                                                    .build())
                                    .build());
                }
            } catch (Exception e) {
                log.warn("Security group setup failed: {}", e.getMessage());
                createdSecurityGroupId = "sg-default";
            }

            try {
                RegisterImageResponse amiResponse = setupClient.registerImage(
                        RegisterImageRequest.builder()
                                .name(amiName)
                                .rootDeviceName("/dev/sda1")
                                .virtualizationType("hvm")
                                .build());
                createdAmiId = amiResponse.imageId();
                log.info("Registered AMI: {}", createdAmiId);
            } catch (Exception e) {
                log.warn("AMI setup failed: {}", e.getMessage());
                createdAmiId = "ami-default";
            }

            setupClient.close();
            // Wait until mock servers are responsive before returning
            try {
                waitForMocksReadyInternal(30);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                log.warn("Interrupted while waiting for mock servers to become ready");
            }
        } catch (Exception e) {
            throw new RuntimeException(
                    "Failed to start mock servers for IntegrationTestEnvironment or configure Floci", e);
        }
    }

    private static void waitForMocksReadyInternal(long timeoutSeconds) throws InterruptedException {
        log.info("Waiting up to {}s for mock servers to become responsive", timeoutSeconds);
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);

        boolean httpOk = false;
        boolean wsOk = false;

        while (System.nanoTime() < deadline) {
            try {
                if (browserEmulatorMock != null) {
                    int port = browserEmulatorMock.getPort();
                    boolean tls = browserEmulatorMock.isHttps();
                    httpOk = probeHttpPing(port, tls, Duration.ofSeconds(2));
                } else {
                    httpOk = true;
                }

                if (webSocketMockServer != null) {
                    int port = webSocketMockServer.getPort();
                    boolean tls = webSocketMockServer.getCertificate() != null || webSocketMockServer.isRunning();
                    wsOk = probeWebSocket(port, tls, Duration.ofSeconds(2));
                } else {
                    wsOk = true;
                }

                if (httpOk && wsOk) {
                    log.info("Mock servers are responsive (http={}, ws={})", httpOk, wsOk);
                    return;
                }
            } catch (Throwable t) {
                log.debug("Probe attempt failed: {}", t.getMessage());
            }

            Thread.sleep(500);
        }

        log.warn("Mock servers did not become fully responsive within {}s (http={}, ws={})", timeoutSeconds,
                httpOk, wsOk);
    }

    private static boolean probeHttpPing(int port, boolean tls, Duration timeout) {
        try {
            String scheme = tls ? "https" : "http";
            java.net.URI uri = new java.net.URI(scheme + "://localhost:" + port + "/instance/ping");

            HttpClient client;
            if (tls) {
                javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[] {
                        new javax.net.ssl.X509TrustManager() {
                            public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                                return null;
                            }

                            public void checkClientTrusted(java.security.cert.X509Certificate[] certs,
                                    String authType) {
                            }

                            public void checkServerTrusted(java.security.cert.X509Certificate[] certs,
                                    String authType) {
                            }
                        }
                };
                javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLS");
                sc.init(null, trustAllCerts, new java.security.SecureRandom());
                client = HttpClient.newBuilder().sslContext(sc).connectTimeout(timeout).build();
            } else {
                client = HttpClient.newBuilder().connectTimeout(timeout).build();
            }

            HttpRequest req = HttpRequest.newBuilder().uri(uri).GET().timeout(timeout).build();
            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
            return resp.statusCode() == 200 && "Pong".equals(resp.body());
        } catch (Throwable t) {
            return false;
        }
    }

    private static boolean probeWebSocket(int port, boolean tls, Duration timeout) {
        try {
            String wsScheme = tls ? "wss" : "ws";
            java.net.URI wsUri = new java.net.URI(wsScheme + "://localhost:" + port + "/events");

            HttpClient client = HttpClient.newBuilder().connectTimeout(timeout).build();
            CompletableFuture<WebSocket> fut = client.newWebSocketBuilder()
                    .connectTimeout(timeout)
                    .buildAsync(wsUri, new java.net.http.WebSocket.Listener() {
                    });
            WebSocket ws = fut.orTimeout(timeout.toMillis(), TimeUnit.MILLISECONDS).join();
            ws.abort();
            return true;
        } catch (Throwable t) {
            // Fallback: try plain HTTP GET to root
            try {
                String scheme = tls ? "https" : "http";
                java.net.URI uri = new java.net.URI(scheme + "://localhost:" + port + "/");
                HttpClient client = HttpClient.newBuilder().connectTimeout(timeout).build();
                HttpRequest req = HttpRequest.newBuilder().uri(uri).GET().timeout(timeout).build();
                HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
                int code = resp.statusCode();
                return code >= 200 && code < 500;
            } catch (Throwable t2) {
                return false;
            }
        }
    }
}
