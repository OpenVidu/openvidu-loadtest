#!/bin/bash
set -eu -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config/config-aws.yaml"
CF_TEMPLATE="${SCRIPT_DIR}/ec2-browser-emulator.yml"
SECURITY_GROUP_NAME="openvidu-loadtest-sg"
SECURITY_GROUP_DESCRIPTION="OpenVidu loadtest browser-emulator security group"

AWS_DEFAULT_REGION="us-east-1"
GIT_REF="v4.0.0"
CACHE_MEDIAFILES_ARGS="bunny 480 30"
SECURITY_GROUP_CIDR="0.0.0.0/0"
DELETE_OLD_AMI=false
SKIP_PERMISSION_CHECK=false
AWS_ENDPOINT=""
AWS_PROFILE=""
DRY_RUN=false
EXISTING_AMI_ID=""

usage() {
    cat >&2 <<EOF
DESCRIPTION:
  Sets up AWS infrastructure for OpenVidu load testing.
  This script:
  - Validates AWS CLI and jq are installed
  - Checks AWS credentials have required permissions
  - Creates a security group for browser-emulator workers
  - Creates an AMI from a configured EC2 instance
  - Updates config/config-aws.yaml with the new AMI and security group

USAGE:
  $0 [OPTIONS]

OPTIONS:
  --region <REGION>
      AWS region where the AMI will be created (default: us-east-1)

  --git-ref <GIT_REF>
      Git reference (branch or tag) to checkout (default: v4.0.0)

  --cache-mediafiles[=<ARGS>]
      Pre-download media files during AMI creation. Use without value for
      default bunny 640x480 30fps, or specify resolutions (e.g., "1080x60 720x30")
      (default: bunny 480 30)

  --dry-run
      Validate configuration and permissions without creating any AWS resources.
      Also outputs the values that would be written to config/config-aws.yaml

  --security-group-cidr <CIDR>
      CIDR block for security group access to ports 5000, 5001
      (default: 0.0.0.0/0)

  --delete-old-ami
      Automatically delete any existing BrowserEmulatorAMI-* AMIs in the region

  --endpoint <URL>
      AWS endpoint URL (e.g., http://localhost:4566)
      When set, all AWS CLI commands will use this endpoint

  --profile <PROFILE>
      AWS CLI profile name to use for all aws CLI commands (overrides default profile)

  --skip-permission-check
      Skip the AWS permission validation step

  --existing-ami-id <AMI_ID>
      Skip AMI creation and use an existing AMI ID directly.
      Useful when AMI was already created or for testing purposes.

  -h, --help
      Display this help message and exit

EXAMPLES:
  # Create AMI in us-east-1 with defaults
  $0

  # Create AMI in eu-west-1 from main branch
  $0 --region eu-west-1 --git-ref main

  # Create AMI with specific media files and restricted CIDR
  $0 --cache-mediafiles="720x30" --security-group-cidr="10.0.0.0/8"

  # Auto-delete old AMIs
  $0 --delete-old-ami

PREREQUISITES:
  - AWS CLI installed and configured with appropriate credentials
  - jq installed
  - AWS IAM permissions for:
    * CloudFormation: CreateStack, DescribeStacks, DeleteStack
    * EC2: RunInstances, DescribeInstances, StopInstances, TerminateInstances,
           CreateImage, DescribeImages, DescribeVpcs, DescribeSubnets,
           DescribeSecurityGroups, CreateSecurityGroup, AuthorizeSecurityGroupIngress
    * IAM: GetUser

EOF
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    echo "[ERROR] $*" >&2
    exit 1
}

aws_cmd() {
    local args=()
    if [ -n "$AWS_ENDPOINT" ]; then
        args+=(--endpoint-url "$AWS_ENDPOINT")
    fi
    if [ -n "$AWS_PROFILE" ]; then
        args+=(--profile "$AWS_PROFILE")
    fi
    aws "${args[@]}" "$@"
}

check_dry_run() {
    local output
    output=$(aws_cmd "$@" 2>&1)
    local exit_code=$?
    
    if echo "$output" | grep -q "DryRunOperation"; then
        return 0
    fi
    if echo "$output" | grep -q "Request would have succeeded"; then
        return 0
    fi
    return $exit_code
}

check_prerequisites() {
    log "Checking prerequisites..."

    if ! command -v aws &> /dev/null; then
        error "AWS CLI is not installed. Please install AWS CLI: https://aws.amazon.com/cli/"
    fi

    if ! command -v jq &> /dev/null; then
        error "jq is not installed. Please install jq: https://stedolan.github.io/jq/"
    fi

    log "Prerequisites check passed"
}

check_aws_permissions() {
    if [ "$SKIP_PERMISSION_CHECK" = true ]; then
        log "Skipping permission check (--skip-permission-check)"
        return 0
    fi

    # Skip all permission checks when using custom endpoint (e.g., LocalStack)
    if [ -n "$AWS_ENDPOINT" ]; then
        log "Skipping permission check for custom endpoint (LocalStack compatibility)"
        return 0
    fi

    log "Validating AWS credentials and permissions..."

    local errors=0
    
    # Generate unique test name suffix to avoid conflicts
    local test_suffix
    test_suffix=$(date +%s | tail -c 6)

    # Test CloudFormation permissions
    log "  Checking CloudFormation permissions..."
    if ! aws_cmd cloudformation describe-stacks &> /dev/null; then
        echo "  ERROR: cloudformation:DescribeStacks failed" >&2
        errors=$((errors + 1))
    fi

    # Test EC2 Describe permissions
    log "  Checking EC2 permissions..."
    if ! aws_cmd ec2 describe-vpcs &> /dev/null; then
        echo "  ERROR: ec2:DescribeVpcs failed" >&2
        errors=$((errors + 1))
    fi

    if ! aws_cmd ec2 describe-security-groups &> /dev/null; then
        echo "  ERROR: ec2:DescribeSecurityGroups failed" >&2
        errors=$((errors + 1))
    fi

    if ! aws_cmd ec2 describe-subnets &> /dev/null; then
        echo "  ERROR: ec2:DescribeSubnets failed" >&2
        errors=$((errors + 1))
    fi

    if ! aws_cmd ec2 describe-images --owners self --filters "Name=name,Values=TestAMI" &> /dev/null; then
        echo "  ERROR: ec2:DescribeImages failed" >&2
        errors=$((errors + 1))
    fi

    # Test EC2 Create permissions (dry run)
    log "  Testing EC2 create permissions..."
    if ! check_dry_run ec2 run-instances --dry-run --image-id ami-0b6c6ebed2801a5cb --instance-type t3.micro --count 1 >/dev/null 2>&1; then
        echo "  ERROR: ec2:RunInstances permission test failed" >&2
        errors=$((errors + 1))
    fi

    if ! check_dry_run ec2 create-security-group --dry-run --group-name "test-sg-${test_suffix}" --description test >/dev/null 2>&1; then
        echo "  ERROR: ec2:CreateSecurityGroup permission test failed" >&2
        errors=$((errors + 1))
    fi

    if [ $errors -gt 0 ]; then
        error "Permission validation failed with $errors error(s). Please ensure your IAM user/role has the required permissions."
    fi

    log "Permission validation passed"
}

get_default_vpc() {
    local vpc_id
    vpc_id=$(aws_cmd ec2 describe-vpcs --filters "Name=is-default,Values=true" --query 'Vpcs[0].VpcId' --output text 2>/dev/null || echo "")
    
    if [ -z "$vpc_id" ] || [ "$vpc_id" = "None" ]; then
        # Try to get any VPC if no default exists
        vpc_id=$(aws_cmd ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text 2>/dev/null || echo "")
    fi
    
    # Filter out "None" string
    if [ "$vpc_id" = "None" ]; then
        echo ""
        return
    fi
    
    echo "$vpc_id"
}

ensure_security_group() {
    log "Checking for security group '${SECURITY_GROUP_NAME}'..."

    local sg_id
    sg_id=$(aws_cmd ec2 describe-security-groups \
        --filters "Name=group-name,Values=${SECURITY_GROUP_NAME}" \
        --query 'SecurityGroups[0].GroupId' \
        --output text 2>/dev/null || echo "")

    # Filter out "None" string
    if [ "$sg_id" = "None" ]; then
        sg_id=""
    fi

    if [ -n "$sg_id" ]; then
        log "Security group already exists: ${sg_id}"
        
        # Check if required ports are open
        local port_5000=false
        local port_5001=false
        
        for ip_permission in $(aws_cmd ec2 describe-security-groups --group-ids "$sg_id" --query 'SecurityGroups[0].IpPermissions[].{Port:ToPort,IpRanges:IpRanges}' --output json 2>/dev/null | jq -r '.[] | @base64' 2>/dev/null || echo ""); do
            if [ -z "$ip_permission" ]; then
                continue
            fi
            local port
            port=$(echo "$ip_permission" | base64 -d | jq -r '.Port // empty')
            local cidr
            cidr=$(echo "$ip_permission" | base64 -d | jq -r '.IpRanges[0].CidrIp // empty')
            
            if [ "$port" = "5000" ]; then
                port_5000=true
            fi
            if [ "$port" = "5001" ]; then
                port_5001=true
            fi
        done
        
        if [ "$port_5000" = false ] || [ "$port_5001" = false ]; then
            log "Adding missing security group rules for ports 5000, 5001"
            if [ "$port_5000" = false ]; then
                aws_cmd ec2 authorize-security-group-ingress --group-id "$sg_id" \
                    --protocol tcp --port 5000 --cidr "$SECURITY_GROUP_CIDR" >/dev/null 2>&1 || true
            fi
            if [ "$port_5001" = false ]; then
                aws_cmd ec2 authorize-security-group-ingress --group-id "$sg_id" \
                    --protocol tcp --port 5001 --cidr "$SECURITY_GROUP_CIDR" >/dev/null 2>&1 || true
            fi
        fi
        
        echo "$sg_id"
        return
    fi

    local vpc_id
    vpc_id=$(get_default_vpc)
    
    if [ -z "$vpc_id" ]; then
        error "No VPC found in region ${AWS_DEFAULT_REGION}. Please create a VPC first."
    fi

    log "Creating security group '${SECURITY_GROUP_NAME}' in VPC ${vpc_id}..."
    sg_id=$(aws_cmd ec2 create-security-group \
        --group-name "$SECURITY_GROUP_NAME" \
        --description "$SECURITY_GROUP_DESCRIPTION" \
        --vpc-id "$vpc_id" \
        --query 'GroupId' \
        --output text)

    log "Opening ports 5000 and 5001 for CIDR ${SECURITY_GROUP_CIDR}..."
    aws_cmd ec2 authorize-security-group-ingress --group-id "$sg_id" \
        --protocol tcp --port 5000 --cidr "$SECURITY_GROUP_CIDR" >/dev/null 2>&1
    aws_cmd ec2 authorize-security-group-ingress --group-id "$sg_id" \
        --protocol tcp --port 5001 --cidr "$SECURITY_GROUP_CIDR" >/dev/null 2>&1

    echo "$sg_id"
}

check_existing_ami() {
    log "Checking for existing BrowserEmulatorAMI in region ${AWS_DEFAULT_REGION}..."
    
    local existing_ami
    existing_ami=$(aws_cmd ec2 describe-images \
        --filters "Name=name,Values=BrowserEmulatorAMI-*" \
        --query 'Images[*].{Id:ImageId,Name:Name,Date:CreationDate}' \
        --output json 2>/dev/null || echo "[]")

    if [ "$existing_ami" = "[]" ] || [ -z "$existing_ami" ]; then
        log "No existing AMIs found"
        return
    fi

    local ami_count
    ami_count=$(echo "$existing_ami" | jq 'length')
    
    log "Found ${ami_count} existing AMI(s):"
    echo "$existing_ami" | jq -r '.[] | "  - \(.Id): \(.Name)"'

    # In dry-run mode, skip deletion prompt
    if [ "$DRY_RUN" = true ]; then
        log "DRY RUN: Would not delete existing AMIs"
        return
    fi

    if [ "$DELETE_OLD_AMI" = true ]; then
        log "Deleting old AMIs (--delete-old-ami)..."
        echo "$existing_ami" | jq -r '.[] | .Id' | while read -r ami_id; do
            log "Deregistering AMI: ${ami_id}"
            aws_cmd ec2 deregister-image --image-id "$ami_id" || true
            
            # Find and delete associated snapshots
            local snapshot_ids
            snapshot_ids=$(aws_cmd ec2 describe-snapshots --filters "Name=description,Values=*${ami_id}*" --query 'Snapshots[*].SnapshotId' --output text 2>/dev/null || echo "")
            for snap_id in $snapshot_ids; do
                log "Deleting snapshot: ${snap_id}"
                aws_cmd ec2 delete-snapshot --snapshot-id "$snap_id" || true
            done
        done
        log "Old AMIs deleted"
        return
    fi

    echo ""
    read -p "Delete old AMIs? [y/N]: " -n 1 -r reply
    echo
    if [[ $reply =~ ^[Yy]$ ]]; then
        DELETE_OLD_AMI=true
        echo "$existing_ami" | jq -r '.[] | .Id' | while read -r ami_id; do
            log "Deregistering AMI: ${ami_id}"
            aws_cmd ec2 deregister-image --image-id "$ami_id" || true
            
            local snapshot_ids
            snapshot_ids=$(aws_cmd ec2 describe-snapshots --filters "Name=description,Values=*${ami_id}*" --query 'Snapshots[*].SnapshotId' --output text 2>/dev/null || echo "")
            for snap_id in $snapshot_ids; do
                log "Deleting snapshot: ${snap_id}"
                aws_cmd ec2 delete-snapshot --snapshot-id "$snap_id" || true
            done
        done
        log "Old AMIs deleted"
    else
        log "Keeping existing AMIs"
    fi
}

create_ami() {
    log "Creating AMI with CloudFormation..."

    local datestamp
    datestamp=$(date +%s)
    local stack_name="BrowserEmulatorAMI-${datestamp}"

    log "Stack name: ${stack_name}"
    log "CloudFormation template: ${CF_TEMPLATE}"
    log "Git ref: ${GIT_REF}"
    log "Cache media files: ${CACHE_MEDIAFILES_ARGS}"

    local temp_json
    temp_json=$(mktemp -t cloudformation-XXX --suffix .json)

    cat > "$temp_json" <<EOF
[
    {"ParameterKey": "ImageId", "ParameterValue": "ami-0b6c6ebed2801a5cb"},
    {"ParameterKey": "GitRef", "ParameterValue": "${GIT_REF}"},
    {"ParameterKey": "CacheMediaFilesArgs", "ParameterValue": "${CACHE_MEDIAFILES_ARGS}"}
]
EOF

    log "Creating CloudFormation stack: ${stack_name}"
    aws_cmd cloudformation create-stack \
        --stack-name "$stack_name" \
        --template-body "file://${CF_TEMPLATE}" \
        --parameters "file://${temp_json}" \
        --disable-rollback >/dev/null 2>&1

    log "Waiting for stack creation to complete..."
    aws_cmd cloudformation wait stack-create-complete --stack-name "$stack_name" >/dev/null 2>&1

    log "Getting instance ID..."
    local instance_id
    instance_id=$(aws_cmd ec2 describe-instances \
        --filters "Name=tag:Name,Values=${stack_name}" \
        --query 'Reservations[].Instances[].InstanceId' \
        --output text 2>/dev/null)

    log "Stopping instance ${instance_id}..."
    aws_cmd ec2 stop-instances --instance-ids "$instance_id" >/dev/null 2>&1

    log "Waiting for instance to stop..."
    aws_cmd ec2 wait instance-stopped --instance-ids "$instance_id" >/dev/null 2>&1

    log "Creating AMI from instance..."
    local ami_id
    ami_id=$(aws_cmd ec2 create-image \
        --instance-id "$instance_id" \
        --name "BrowserEmulatorAMI-${datestamp}" \
        --description "Browser Emulator AMI" \
        --query 'ImageId' \
        --output text 2>/dev/null)

    log "Created AMI: ${ami_id}"

    log "Cleaning up CloudFormation stack..."
    aws_cmd cloudformation delete-stack --stack-name "$stack_name" >/dev/null 2>&1
    rm "$temp_json"

    aws_cmd cloudformation wait stack-delete-complete --stack-name "$stack_name" >/dev/null 2>&1

    log "Waiting for AMI to become available..."
    local exit_status=1
    while [ "$exit_status" != "0" ]; do
        log "Waiting for AMI available..."
        aws_cmd ec2 wait image-available --image-ids "$ami_id" 2>/dev/null || true
        exit_status=$?
    done

    log "AMI is now available: ${ami_id}"
    echo "$ami_id"
}

update_config() {
    local ami_id="$1"
    local sg_id="$2"

    log "Updating config/config-aws.yaml..."

    if [ ! -f "$CONFIG_FILE" ]; then
        error "Config file not found: ${CONFIG_FILE}"
    fi

    # Create a temp file and use awk for safer substitution
    local temp_file
    temp_file=$(mktemp)
    
    awk -v ami_id="$ami_id" -v sg_id="$sg_id" -v region="$AWS_DEFAULT_REGION" '
        /^  amiId:/ { print "  amiId: " ami_id; next }
        /^  securityGroupId:/ { print "  securityGroupId: " sg_id; next }
        /^  region:/ { print "  region: " region; next }
        { print }
    ' "$CONFIG_FILE" > "$temp_file" && mv "$temp_file" "$CONFIG_FILE"

    log "Config file updated successfully"
    log "  AMI ID: ${ami_id}"
    log "  Security Group: ${sg_id}"
    log "  Region: ${AWS_DEFAULT_REGION}"
}

while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --region)
            AWS_DEFAULT_REGION="$2"
            shift
            shift
            ;;
        --git-ref)
            GIT_REF="$2"
            shift
            shift
            ;;
        --cache-mediafiles)
            if [[ $# -gt 1 ]] && [[ "$2" != --* ]]; then
                CACHE_MEDIAFILES_ARGS="$2"
                shift
                shift
            else
                CACHE_MEDIAFILES_ARGS="__enabled__"
                shift
            fi
            ;;
        --cache-mediafiles=*)
            CACHE_MEDIAFILES_ARGS="${1#*=}"
            shift
            ;;
        --security-group-cidr)
            SECURITY_GROUP_CIDR="$2"
            shift
            shift
            ;;
        --delete-old-ami)
            DELETE_OLD_AMI=true
            shift
            ;;
        --endpoint)
            AWS_ENDPOINT="$2"
            shift
            shift
            ;;
        --skip-permission-check)
            SKIP_PERMISSION_CHECK=true
            shift
            ;;
        --profile)
            AWS_PROFILE="$2"
            shift
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --existing-ami-id)
            EXISTING_AMI_ID="$2"
            shift
            shift
            ;;
        -h | --help)
            usage
            ;;
        *)
            echo "Unknown argument: $key" >&2
            usage
            ;;
    esac
done

export AWS_DEFAULT_REGION

log "Starting AWS setup for OpenVidu LoadTest"
log "  Region: ${AWS_DEFAULT_REGION}"
log "  Git Ref: ${GIT_REF}"
log "  Cache Media Files: ${CACHE_MEDIAFILES_ARGS}"
log "  Security Group CIDR: ${SECURITY_GROUP_CIDR}"
[ -n "$AWS_ENDPOINT" ] && log "  Endpoint: ${AWS_ENDPOINT}"
[ -n "$AWS_PROFILE" ] && log "  Profile: ${AWS_PROFILE}"
[ "$DRY_RUN" = true ] && log "  DRY RUN MODE - No resources will be created"

check_prerequisites
check_aws_permissions
check_existing_ami

if [ "$DRY_RUN" = true ]; then
    log "DRY RUN: Would create security group '${SECURITY_GROUP_NAME}' in VPC"
    SG_VPC=$(get_default_vpc)
    log "DRY RUN: VPC for security group: ${SG_VPC:-<auto-detect>}"
    log "DRY RUN: Would open ports 5000, 5001 to CIDR ${SECURITY_GROUP_CIDR}"
    log "DRY RUN: Would create AMI with GitRef=${GIT_REF}, CacheMediaFiles=${CACHE_MEDIAFILES_ARGS}"
    log ""
    log "DRY RUN: config/config-aws.yaml would be updated with:"
    log "  - amiId: <new-ami-id>"
    log "  - securityGroupId: <new-sg-id>"
    log "  - region: ${AWS_DEFAULT_REGION}"
    log "  - workersAtStart: 1"
    log "  - rampUpWorkers: 1"
    log ""
    log "DRY RUN complete. No AWS resources created."
    exit 0
fi

SECURITY_GROUP_ID=$(ensure_security_group)

if [ -n "$EXISTING_AMI_ID" ]; then
    log "Using existing AMI ID: ${EXISTING_AMI_ID}"
    AMI_ID="$EXISTING_AMI_ID"
else
    AMI_ID=$(create_ami)
fi

update_config "$AMI_ID" "$SECURITY_GROUP_ID"

log "Setup complete!"
log "You can now run: docker compose -f docker-compose.aws.yml up --build"