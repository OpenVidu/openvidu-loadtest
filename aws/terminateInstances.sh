#!/bin/bash
set -eu -o pipefail

INSTANCES=$(aws ec2 describe-instances --filters Name=tag:Type,Values=OpenViduLoadTest | jq -r ' .Reservations[] | .Instances[] | .InstanceId')
aws ec2 terminate-instances --instance-ids $INSTANCES
