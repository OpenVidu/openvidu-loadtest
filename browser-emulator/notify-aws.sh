#!/usr/bin/env bash
# Bash options for strict error checking.

set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace

pip3 install --break-system-packages https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz

# Ensure AWS_STACK and AWS_REGION are available. If not set in the current
# environment, try loading them from /etc/environment (CloudFormation writes
# these there in userdata). Use safe expansions to avoid nounset failures.
if [ -z "${AWS_STACK:-}" ] || [ -z "${AWS_REGION:-}" ]; then
	if [ -f /etc/environment ]; then
		. /etc/environment || true
	fi
fi

if [ -z "${AWS_STACK:-}" ] || [ -z "${AWS_REGION:-}" ]; then
	echo "Required AWS variables AWS_STACK or AWS_REGION not set" >&2
	exit 1
fi

# sending the finish call
cfn-signal -e 0 --stack "${AWS_STACK}" --resource BrowserInstance --region "${AWS_REGION}"

echo "Instance is ready"
