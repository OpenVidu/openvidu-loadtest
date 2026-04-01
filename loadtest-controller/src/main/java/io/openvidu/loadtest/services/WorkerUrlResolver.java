package io.openvidu.loadtest.services;

import java.util.List;

import org.springframework.stereotype.Service;

import software.amazon.awssdk.services.ec2.model.Instance;

@Service
public class WorkerUrlResolver {

    public String resolveUrl(Instance instance) {
        return instance.publicDnsName();
    }

    public List<String> resolveUrls(List<Instance> instances) {
        return instances.stream().map(this::resolveUrl).toList();
    }
}
