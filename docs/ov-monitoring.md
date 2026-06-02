# Monitoring OpenVidu media and master nodes with Metricbeat

The configuration in [`server-resources/metricbeat-configs/metricbeat.yml`](../server-resources/metricbeat-configs/metricbeat.yml) is a [Metricbeat](https://www.elastic.co/beats/metricbeat) configuration designed to be deployed directly on an OpenVidu **media node** or **master node** host. It collects system-level metrics from the underlying machine and ships them to an Elasticsearch instance, where they can be visualized in Kibana dashboard product of a load test (see [Monitoring](../README.md#monitoring)).

## Configuration Variables

The configuration file ([`metricbeat.yml`](../server-resources/metricbeat-configs/metricbeat.yml)) is a template that uses environment variable substitution. Before starting Metricbeat, you must export the following variables in the environment of the process that runs it.

| Variable                 | Required | Description                                                                                                                                                           |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_TYPE`              | Yes      | The role of the node where Metricbeat is running. Allowed values are `medianode` (an OpenVidu media node) or `masternode` (an OpenVidu master/control node).          |
| `NODE_ID`                | Yes      | A free-form identifier chosen by the user to uniquely identify this particular node within its role (for example `1`, `eu-west-1a`, or any naming scheme you prefer). |
| `ELASTICSEARCH_HOSTNAME` | Yes      | The full URL of the Elasticsearch instance where the metrics should be shipped, including scheme and port (for example `http://elasticsearch.example.com:9200`).      |
| `ELASTICSEARCH_USERNAME` | Yes      | The username used to authenticate against Elasticsearch. Make sure the account has permission to create and write to `metricbeat-*` indices.                          |
| `ELASTICSEARCH_PASSWORD` | Yes      | The password for the Elasticsearch account specified by `ELASTICSEARCH_USERNAME`.                                                                                     |

## Running Metricbeat

### 1. Download the configuration file

Download the configuration file directly from the repository. The example below saves the file as `~/metricbeat.yml` in your home directory:

```bash
wget -O ~/metricbeat.yml \
  https://raw.githubusercontent.com/openvidu/openvidu-loadtest/main/server-resources/metricbeat-configs/metricbeat.yml
```

### 2. Start Metricbeat with the provided configuration

#### As a Docker container (recommended)

The image, bind mounts and entrypoint match what the browser-emulator uses for its workers ([`browser-emulator/src/services/instance.service.ts`](../browser-emulator/src/services/instance.service.ts)), so the on-host metric collection stays in sync with the worker configuration. The container is launched with the same arguments, adapted to use the `NODE_TYPE` and `NODE_ID` variables defined above instead of the worker `WORKER_UUID`.

```bash
docker run -d \
  --name metricbeat \
  -u root \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ~/metricbeat.yml:/usr/share/metricbeat/metricbeat.yml:ro \
  -v /proc:/hostfs/proc:ro \
  -v /sys/fs/cgroup:/hostfs/sys/fs/cgroup:ro \
  -v /:/hostfs:ro \
  -e NODE_TYPE=medianode \
  -e NODE_ID=1 \
  -e ELASTICSEARCH_HOSTNAME=http://elasticsearch.example.com:9200 \
  -e ELASTICSEARCH_USERNAME=elastic \
  -e ELASTICSEARCH_PASSWORD=changeme \
  docker.elastic.co/beats/metricbeat-oss:7.12.0 \
  /bin/bash -c "metricbeat -e -strict.perms=false -e -system.hostfs=/hostfs"
```

What each argument does:

- `--name metricbeat`: names the container so it can be managed by name (`docker logs metricbeat`, `docker stop metricbeat`, etc.).
- `-u root`: required so Metricbeat can read the bind-mounted host paths.
- `-v /var/run/docker.sock:/var/run/docker.sock`, `-v ~/metricbeat.yml:/usr/share/metricbeat/metricbeat.yml:ro`, `-v /proc:/hostfs/proc:ro`, `-v /sys/fs/cgroup:/hostfs/sys/fs/cgroup:ro`, `-v /:/hostfs:ro`: the same bind mounts used by the browser-emulator. They expose the host's Docker socket, the configuration file, and the host's proc, cgroup and root filesystems (under `/hostfs`), so Metricbeat can collect system-level metrics from the underlying host.
- `-e NODE_TYPE`, `-e NODE_ID`, `-e ELASTICSEARCH_HOSTNAME`, `-e ELASTICSEARCH_USERNAME`, `-e ELASTICSEARCH_PASSWORD`: inject the values defined in [Configuration Variables](#configuration-variables).
- `/bin/bash -c "metricbeat -e -strict.perms=false -e -system.hostfs=/hostfs"`: the same entrypoint used by the browser-emulator. The `-e` flag enables verbose logging, `-strict.perms=false` avoids permission warnings on the rendered config, the second `-e` is kept for parity with the browser-emulator command, and `-system.hostfs=/hostfs` tells the `system` module to read host metrics from the bind-mounted paths.

### 3. Verify the metrics are reaching Elasticsearch

After a few seconds, you should see new documents in Elasticsearch under indices matching the `metricbeat-*` pattern. The simplest way to confirm is with a query against your Elasticsearch host:

```bash
curl -u "$ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD" \
  "http://$ELASTICSEARCH_HOSTNAME/metricbeat-*/_search?pretty&size=1&q=node_role:medianode"
```

If the configuration is working, the response will contain a hit with the `worker_name` and `node_role` fields populated as expected (e.g. `worker_name: "medianode_1"`, `node_role: "medianode"`).

## Related Documentation

- [Metricbeat system module reference](https://www.elastic.co/guide/en/beats/metricbeat/current/metricbeat-module-system.html)
- [Main OpenVidu Load Test documentation](../README.md)
