package io.openvidu.loadtest.models.monitoring;

import java.util.Collections;
import java.util.DoubleSummaryStatistics;
import java.util.List;

/**
 * A time series of an OpenVidu/LiveKit platform metric collected from
 * Prometheus (through Grafana) for the duration of a load test.
 */
public class PlatformMetric {

    public record Point(double timestamp, double value) {
    }

    private final String name;
    private final String unit;
    private final String description;
    private final List<Point> points;
    private final double min;
    private final double max;
    private final double avg;

    public PlatformMetric(String name, String unit, String description, List<Point> points) {
        this.name = name;
        this.unit = unit;
        this.description = description;
        this.points = points != null ? Collections.unmodifiableList(points) : List.of();
        DoubleSummaryStatistics stats = this.points.stream()
                .mapToDouble(Point::value)
                .collect(DoubleSummaryStatistics::new,
                        DoubleSummaryStatistics::accept,
                        DoubleSummaryStatistics::combine);
        this.min = stats.getCount() > 0 ? stats.getMin() : 0.0;
        this.max = stats.getCount() > 0 ? stats.getMax() : 0.0;
        this.avg = stats.getCount() > 0 ? stats.getAverage() : 0.0;
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

    public List<Point> getPoints() {
        return points;
    }

    public double getMin() {
        return min;
    }

    public double getMax() {
        return max;
    }

    public double getAvg() {
        return avg;
    }
}
