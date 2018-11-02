#!/bin/bash
set -eu -o pipefail

INSTANCE=$1
aws ec2 terminate-instances --instance-ids $INSTANCE
