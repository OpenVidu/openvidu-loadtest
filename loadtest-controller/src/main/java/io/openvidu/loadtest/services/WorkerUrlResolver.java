package io.openvidu.loadtest.services;

import java.util.List;

import org.springframework.stereotype.Service;

import software.amazon.awssdk.services.ec2.model.Instance;

@Service
public class WorkerUrlResolver {

    public String resolveUrl(Instance instance) {
        String publicDns = instance.publicDnsName();
        if (publicDns != null && !publicDns.isBlank()) {
            return publicDns;
        }
        String privateIp = instance.privateIpAddress();
        if (privateIp != null && !privateIp.isBlank()) {
            return privateIp;
        }
        // Fallback to instance id if no DNS or IP available
        return instance.instanceId();
    }

    public List<String> resolveUrls(List<Instance> instances) {
        return instances.stream().map(this::resolveUrl).toList();
    }
}
