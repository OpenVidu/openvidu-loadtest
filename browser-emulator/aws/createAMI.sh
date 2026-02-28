#!/bin/bash
set -eu -o pipefail

usage() {
  cat >&2 <<EOF
DESCRIPTION:
  Creates an AWS EC2 AMI (Amazon Machine Image) for the OpenVidu Browser Emulator
  from the OpenVidu LoadTest repository. The AMI is created by launching an EC2
  instance, provisioning it with the necessary dependencies, and capturing the
  configured image.

USAGE:
  $0 [OPTIONS]

OPTIONS:
  --region <AWS_DEFAULT_REGION>
      AWS region where the AMI will be created and the EC2 instance will be
      launched. Must be a valid AWS region code (e.g., us-east-1, eu-west-1).
      Default: us-east-1

  --git-ref <GIT_REF>
      Git reference (branch or tag) to checkout from the OpenVidu LoadTest
      repository. Can be a tag (e.g., v3.0.0) or a branch (e.g., master).
      Default: v3.0.0

  --version <TEMPLATE_PATH>
      Path to the CloudFormation template file (EC2-browser-emulator.yml).
      Use this to override the default template location if needed.
      Default: \$(dirname \$0)/EC2-browser-emulator.yml

  -h, --help
      Display this help message and exit.

DEFAULTS:
  Region: us-east-1
  Git Reference: v3.0.0
  Template: EC2-browser-emulator.yml (in the same directory as this script)

EXAMPLES:
  # Create AMI with defaults (tag v3.0.0 in us-east-1)
  $0

  # Create AMI with a specific tag
  $0 --git-ref 3.1.0

  # Create AMI from a branch in a different region
  $0 --region eu-west-1 --git-ref develop

  # Combine multiple options
  $0 --region us-west-2 --git-ref main

PREREQUISITES:
  - AWS CLI must be installed and configured with appropriate credentials
  - jq must be installed (for JSON parsing)
  - Sufficient AWS permissions to:
    * Create CloudFormation stacks
    * Launch EC2 instances
    * Create AMIs
    * Manage VPC security groups and network interfaces

NOTES:
  - The script sets errexit and pipefail for strict error handling
  - CloudFormation stack name includes a timestamp to ensure uniqueness
  - The EC2 instance will be automatically stopped and terminated after AMI creation
  - The script waits for the image to be available before completing
  - Check AWS CloudFormation console for detailed provisioning logs

EOF
  exit 1
}

AWS_DEFAULT_REGION="us-east-1"
GIT_REF="v3.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CF_URL="$SCRIPT_DIR/EC2-browser-emulator.yml"

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --region)
      AWS_DEFAULT_REGION="$2"
      shift; shift;;
    --git-ref)
      GIT_REF="$2"
      shift; shift;;
    --version)
      CF_URL="$2"
      shift; shift;;
    -h|--help)
      usage;;
    *)
      echo "Unknown argument: $key" >&2
      usage;;
  esac
done

export AWS_DEFAULT_REGION
echo "region set to $AWS_DEFAULT_REGION"
echo "git ref set to $GIT_REF"
echo "version set to $CF_URL"

# Please, refer to https://cloud-images.ubuntu.com/locator/ec2/
# to find a valid EC2 AMI
IMAGE_ID=ami-0b6c6ebed2801a5cb

DATESTAMP=$(date +%s)
TEMPJSON=$(mktemp -t cloudformation-XXX --suffix .json)

cat >$TEMPJSON<<EOF
[
	{"ParameterKey":"ImageId", "ParameterValue":"${IMAGE_ID}"},
	{"ParameterKey":"GitRef", "ParameterValue":"${GIT_REF}"}
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
