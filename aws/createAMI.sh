#!/bin/bash
set -eu -o pipefail

export AWS_DEFAULT_REGION=eu-west-1

# Copy template to S3
aws s3 cp EC2Instance-ElastestBrowsers.yaml s3://public.openvidu.io --acl public-read

# Please, refer to https://cloud-images.ubuntu.com/locator/ec2/
# to find a valid EC2 AMI
IMAGE_ID=ami-07042e91d04b1c30d

CF_URL=https://s3-eu-west-1.amazonaws.com/public.openvidu.io/EC2Instance-ElastestBrowsers.yaml

DATESTAMP=$(date +%s)
TEMPJSON=$(mktemp -t cloudformation-XXX --suffix .json)

cat >$TEMPJSON<<EOF
[
	{"ParameterKey":"ImageId", "ParameterValue":"${IMAGE_ID}"}
]
EOF

aws cloudformation create-stack \
  --stack-name ElastestBrowserAMI-${DATESTAMP} \
  --template-url ${CF_URL} \
  --parameters file:///$TEMPJSON \
  --disable-rollback

aws cloudformation wait stack-create-complete --stack-name ElastestBrowserAMI-${DATESTAMP}

echo "Getting instance ID"
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=ElastestBrowserAMI-${DATESTAMP}" | jq -r ' .Reservations[] | .Instances[] | .InstanceId')

echo "Stopping the instance"
aws ec2 stop-instances --instance-ids ${INSTANCE_ID}

echo "wait for the instance to stop"
aws ec2 wait instance-stopped --instance-ids ${INSTANCE_ID}

echo "Creating AMI"
RAW_AMI_ID=$(aws ec2 create-image \
  --instance-id ${INSTANCE_ID} \
  --name ElastestBrowserAMI-${DATESTAMP} \
  --description "Elastest Browser AMI")

echo "Cleaning up"
aws cloudformation delete-stack --stack-name ElastestBrowserAMI-${DATESTAMP}
rm $TEMPJSON
