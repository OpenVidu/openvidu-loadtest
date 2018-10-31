#!/bin/bash
set -eu -o pipefail

aws ec2 describe-instances --filters Name=tag:Type,Values=OpenViduLoadTest,Name=instance-state-name,Values=running | jq -r ' .Reservations[] | .Instances[] | "\(.InstanceId) \(.PublicIpAddress)" '
