#!/usr/bin/env bash
# Bash options for strict error checking.

set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace

pip3 install --break-system-packages https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz

# sending the finish call
CFN_SIGNAL_BIN="$(command -v cfn-signal || true)"
if [[ -z "${CFN_SIGNAL_BIN}" && -x "/home/ubuntu/.local/bin/cfn-signal" ]]; then
    CFN_SIGNAL_BIN="/home/ubuntu/.local/bin/cfn-signal"
fi

if [[ -z "${CFN_SIGNAL_BIN}" ]]; then
    echo "cfn-signal binary not found" >&2
    exit 1
fi

"${CFN_SIGNAL_BIN}" -e 0 --stack "${AWS_STACK}" --resource BrowserInstance --region "${AWS_REGION}"

echo "Instance is ready"
