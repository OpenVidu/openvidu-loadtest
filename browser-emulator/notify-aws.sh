#!/usr/bin/env bash
# Bash options for strict error checking.

set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace

pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz

# sending the finish call
/home/ubuntu/.local/bin/cfn-signal -e 0 --stack ${AWS_STACK} --resource BrowserInstance --region ${AWS_REGION}

echo "Instance is ready"
