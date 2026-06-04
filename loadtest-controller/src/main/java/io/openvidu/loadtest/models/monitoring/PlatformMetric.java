package io.openvidu.loadtest.models.monitoring;

import java.util.Collections;
import java.util.List;

/**
 * A time series of an OpenVidu/LiveKit platform metric collected from
 * Prometheus (through Grafana) for the duration of a load test.
 */
public class PlatformMetric {

    private final String name;
    private final String unit;
    private final String description;
    // Each point is a pair [epochSeconds, value]
    private final List<double[]> points;

    public PlatformMetric(String name, String unit, String description, List<double[]> points) {
        this.name = name;
        this.unit = unit;
        this.description = description;
        this.points = points;
    }

    public String getName() {
        return name;
    }

    public String getUnit() {
        return unit;
    }

    public String getDescription() {
        return description;
    }

    public List<double[]> getPoints() {
        return Collections.unmodifiableList(points);
    }

    public double getMin() {
        return points.stream().mapToDouble(p -> p[1]).min().orElse(0);
    }

    public double getMax() {
        return points.stream().mapToDouble(p -> p[1]).max().orElse(0);
    }

    public double getAvg() {
        return points.stream().mapToDouble(p -> p[1]).average().orElse(0);
    }
}
