#!/bin/bash
set -eu -o pipefail

IMAGE_ID=
INSTANCE_TYPE=
KEY_NAME=kms-
SECURITY_GROUP=

NUM_INSTANCES=$1

aws ec2 run-instances \
  --image-id ${IMAGE_ID} \
  --instance-type ${INSTANCE_TYPE} \
  --key-name ${KEY_NAME} \
  --security-group-ids ${SECURITY_GROUP} \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Type,Value=OpenViduLoadTest}]' \
  --count 1:$NUM_INSTANCES >/dev/null

# Wait for the instances to be running
INSTANCES=$(aws ec2 describe-instances --filters Name=tag:Type,Values=OpenViduLoadTest,Name=instance-state-name,Values=pending | jq -r ' .Reservations[] | .Instances[] | .InstanceId')
aws ec2 wait instance-running --instance-ids $INSTANCES

aws ec2 describe-instances --filters Name=tag:Type,Values=OpenViduLoadTest,Name=instance-state-name,Values=running
