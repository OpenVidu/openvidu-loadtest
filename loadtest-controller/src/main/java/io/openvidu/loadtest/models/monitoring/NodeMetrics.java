package io.openvidu.loadtest.models.monitoring;

import java.util.Collections;
import java.util.List;

/**
 * Resource usage of one node of the OpenVidu deployment under test (a media
 * node or a master node), aggregated over the duration of a test case.
 *
 * <p>
 * Collected from the Metricbeat documents the nodes ship to Elasticsearch (see
 * {@code docs/ov-monitoring.md}), not from the load test workers: this is the
 * CPU of the platform being tested, which is what determines how many cores a
 * deployment needs.
 */
public class NodeMetrics {

    /**
     * CPU and memory of a single container running on the node. Lets a node's
     * CPU be attributed to individual OpenVidu services, so the cost of media
     * routing can be told apart from the cost of, for example, a recording.
     *
     * @param name         container name as reported by Docker
     * @param cpuAvgCores  average CPU in cores (1.0 = one full core busy)
     * @param cpuMaxCores  peak CPU in cores
     * @param memAvgBytes  average resident memory in bytes
     */
    public record ContainerMetrics(String name, double cpuAvgCores, double cpuMaxCores, double memAvgBytes) {
    }

    private final String nodeName;
    private final String nodeRole;
    private final double cpuAvgPct;
    private final double cpuMaxPct;
    private final double memAvgPct;
    private final double memMaxPct;
    private final long samples;
    private final List<ContainerMetrics> containers;

    public NodeMetrics(String nodeName, String nodeRole, double cpuAvgPct, double cpuMaxPct, double memAvgPct,
            double memMaxPct, long samples, List<ContainerMetrics> containers) {
        this.nodeName = nodeName;
        this.nodeRole = nodeRole;
        this.cpuAvgPct = cpuAvgPct;
        this.cpuMaxPct = cpuMaxPct;
        this.memAvgPct = memAvgPct;
        this.memMaxPct = memMaxPct;
        this.samples = samples;
        this.containers = containers != null ? Collections.unmodifiableList(containers) : List.of();
    }

    public String getNodeName() {
        return nodeName;
    }

    public String getNodeRole() {
        return nodeRole;
    }

    /** Average CPU of the whole node, as a percentage normalized by core count. */
    public double getCpuAvgPct() {
        return cpuAvgPct;
    }

    /** Peak CPU of the whole node, as a percentage normalized by core count. */
    public double getCpuMaxPct() {
        return cpuMaxPct;
    }

    public double getMemAvgPct() {
        return memAvgPct;
    }

    public double getMemMaxPct() {
        return memMaxPct;
    }

    /** Number of Metricbeat samples the aggregation is based on. */
    public long getSamples() {
        return samples;
    }

    /** Containers of this node, busiest first. Empty unless the Metricbeat {@code docker} module is enabled. */
    public List<ContainerMetrics> getContainers() {
        return containers;
    }

    public boolean isMediaNode() {
        return "medianode".equalsIgnoreCase(nodeRole);
    }

    @Override
    public String toString() {
        return nodeName + " (" + nodeRole + "): CPU avg " + String.format("%.2f%%", cpuAvgPct)
                + ", max " + String.format("%.2f%%", cpuMaxPct)
                + " | MEM avg " + String.format("%.2f%%", memAvgPct)
                + ", max " + String.format("%.2f%%", memMaxPct)
                + " | " + samples + " samples";
    }
}
