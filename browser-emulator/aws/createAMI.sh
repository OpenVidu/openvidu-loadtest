#!/bin/bash
set -eu -o pipefail

usage() {
  echo "Usage: $0 [--region <AWS_DEFAULT_REGION>] [--version <CF_URL>]" >&2
  echo "Defaults: --region us-east-1 --version $PWD/livekit/EC2-browser-emulator-no-qoe-firefox.yml" >&2
  exit 1
}

AWS_DEFAULT_REGION="us-east-1"
CF_URL="$PWD/livekit/EC2-browser-emulator-no-qoe.yml"

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --region)
      AWS_DEFAULT_REGION="$2"
      shift; shift;;
    --version)
      CF_URL="$2"
      shift; shift;;
    *)
      echo "Unknown argument: $key" >&2
      usage;;
  esac
done

export AWS_DEFAULT_REGION
echo "region set to $AWS_DEFAULT_REGION"
echo "version set to $CF_URL"

# Please, refer to https://cloud-images.ubuntu.com/locator/ec2/
# to find a valid EC2 AMI
IMAGE_ID=ami-09e67e426f25ce0d7

DATESTAMP=$(date +%s)
TEMPJSON=$(mktemp -t cloudformation-XXX --suffix .json)

cat >$TEMPJSON<<EOF
[
	{"ParameterKey":"ImageId", "ParameterValue":"${IMAGE_ID}"}
]
EOF

aws cloudformation create-stack \
  --stack-name BrowserEmulatorAMI-${DATESTAMP} \
  --template-body file:///${CF_URL} \
  --parameters file:///$TEMPJSON \
  --disable-rollback

aws cloudformation wait stack-create-complete --stack-name BrowserEmulatorAMI-${DATESTAMP}

echo "Getting instance ID"
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=BrowserEmulatorAMI-${DATESTAMP}" | jq -r ' .Reservations[] | .Instances[] | .InstanceId')

echo "Stopping the instance"
aws ec2 stop-instances --instance-ids ${INSTANCE_ID}

echo "wait for the instance to stop"
aws ec2 wait instance-stopped --instance-ids ${INSTANCE_ID}

AMI_ID=$(aws ec2 create-image \
  --instance-id ${INSTANCE_ID} \
  --name BrowserEmulatorAMI-${DATESTAMP} \
  --description "Browser Emulator AMI" | jq -r '.ImageId')

echo "Creating AMI: ${AMI_ID}"

echo "Cleaning up ..."
aws cloudformation delete-stack --stack-name BrowserEmulatorAMI-${DATESTAMP}
rm $TEMPJSON

aws cloudformation wait stack-delete-complete --stack-name BrowserEmulatorAMI-${DATESTAMP}

# Create a while loop because an error waiting image available
# Waiter ImageAvailable failed: Max attempts exceeded
exit_status=1
while [ "${exit_status}" != "0" ]
do
    echo "Waiting to AMI available ..."
    aws ec2 wait image-available --image-ids ${AMI_ID}
    exit_status="$?"

done

echo "Created AMI: ${AMI_ID}"
