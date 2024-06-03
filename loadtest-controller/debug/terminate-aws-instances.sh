#!/bin/bash
EXCLUDE_INSTANCE_ID="i-0e0fdd65a96c93029"
INSTANCE_IDS=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=Worker" \
  --query 'Reservations[].Instances[].[InstanceId]' \
  --output text | grep -v "$EXCLUDE_INSTANCE_ID")
if [ -n "$INSTANCE_IDS" ]; then
  aws ec2 terminate-instances --instance-ids $INSTANCE_IDS
else
    echo "No instances to terminate"
fi