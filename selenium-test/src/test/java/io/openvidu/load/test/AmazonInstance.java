package io.openvidu.load.test;

public class AmazonInstance {

	private String instanceId;
	private String ip;

	public AmazonInstance(String instanceId, String ip) {
		this.instanceId = instanceId;
		this.ip = ip;
	}

	public String getInstanceId() {
		return this.instanceId;
	}

	public String getIp() {
		return this.ip;
	}

	@Override
	public String toString() {
		return "{id: \"" + this.instanceId + "\", ip: \"" + this.ip + "\"}";
	}

}
