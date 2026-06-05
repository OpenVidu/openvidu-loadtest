package io.openvidu.loadtest.unit.models.monitoring;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import io.openvidu.loadtest.models.monitoring.PlatformMetric;
import io.openvidu.loadtest.models.monitoring.PlatformMetric.Point;

class PlatformMetricTest {

    @Test
    void testConstructorAndGetters() {
        List<Point> points = new ArrayList<>();
        points.add(new Point(1000.0, 10.0));
        points.add(new Point(2000.0, 20.0));
        points.add(new Point(3000.0, 30.0));

        PlatformMetric metric = new PlatformMetric("participants", "count", "Test metric", points);

        assertEquals("participants", metric.getName());
        assertEquals("count", metric.getUnit());
        assertEquals("Test metric", metric.getDescription());
        assertEquals(3, metric.getPoints().size());
    }

    @Test
    void testGetMinMaxAvg() {
        List<Point> points = List.of(
                new Point(1000.0, 10.0),
                new Point(2000.0, 30.0),
                new Point(3000.0, 20.0));
        PlatformMetric metric = new PlatformMetric("test", "ms", "test", points);

        assertEquals(10.0, metric.getMin(), 0.001);
        assertEquals(30.0, metric.getMax(), 0.001);
        assertEquals(20.0, metric.getAvg(), 0.001);
    }

    @Test
    void testGetMinMaxAvgWithSinglePoint() {
        PlatformMetric metric = new PlatformMetric("test", "ms", "test",
                List.of(new Point(1000.0, 42.0)));

        assertEquals(42.0, metric.getMin(), 0.001);
        assertEquals(42.0, metric.getMax(), 0.001);
        assertEquals(42.0, metric.getAvg(), 0.001);
    }

    @Test
    void testGetMinMaxAvgWithEmptyPoints() {
        PlatformMetric metric = new PlatformMetric("test", "ms", "test", new ArrayList<>());

        assertEquals(0.0, metric.getMin(), 0.001);
        assertEquals(0.0, metric.getMax(), 0.001);
        assertEquals(0.0, metric.getAvg(), 0.001);
    }

    @Test
    void testGetMinMaxAvgWithNegativeValues() {
        PlatformMetric metric = new PlatformMetric("test", "C", "test",
                List.of(new Point(1000.0, -5.0), new Point(2000.0, 0.0), new Point(3000.0, 15.0)));

        assertEquals(-5.0, metric.getMin(), 0.001);
        assertEquals(15.0, metric.getMax(), 0.001);
        assertEquals(3.333, metric.getAvg(), 0.001);
    }
}
