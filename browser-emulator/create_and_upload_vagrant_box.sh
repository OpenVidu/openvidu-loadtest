#!/bin/bash
BOX_VERSION=0.0.4
BOX_PROVIDER=virtualbox
BOX_ARCHITECTURE=amd64
BOX_FILE=browseremulator
BOX_SUFFIX=.box
BOX_FILE_PATH=/tmp/

# Read .env
set -o allexport
[[ -f .env ]] && source .env
export VAGRANT_VAGRANTFILE=./Vagrantfile_create_box

set -o xtrace

# Upload Vagrant boxes to HashiCorp Cloud Platform
upload_box() {
    local box_file=$1
    local box_name=$2
    # Login to HashiCorp Cloud Platform
    curl --location "https://auth.idp.hashicorp.com/oauth2/token" \
        --header "Content-Type: application/x-www-form-urlencoded" \
        --data-urlencode "client_id=$HCP_CLIENT_ID" \
        --data-urlencode "client_secret=$HCP_CLIENT_SECRET" \
        --data-urlencode "grant_type=client_credentials" \
        --data-urlencode "audience=https://api.hashicorp.cloud" >/tmp/hcp_token.json

    if [ $? -ne 0 ]; then
        echo "Failed to login to HashiCorp Cloud Platform"
        exit 1
    fi

    HCP_TOKEN=$(jq -r '.access_token' /tmp/hcp_token.json)

    if [ -z "$HCP_TOKEN" ]; then
        echo "Failed to retrieve access token"
        exit 1
    fi
    rm /tmp/hcp_token.json
    # create box if it doesn't exist
    response=$(curl --header "Authorization: Bearer $HCP_TOKEN" \
        --header "Content-Type: application/json" \
        --request POST \
        --data "{\"name\":\"$box_name\",\"is_private\":false}" \
        "https://api.cloud.hashicorp.com/vagrant/2022-09-30/registry/$REGISTRY_NAME/boxes")
    if echo "$response" | jq -e '.message | contains("already exists")' >/dev/null; then
        echo "Box already exists, continuing..."
    else
        echo "$response"
    fi
    # create box version if it doesn't exist
    response=$(curl --header "Authorization: Bearer $HCP_TOKEN" \
        --header "Content-Type: application/json" \
        --request POST \
        --data "{\"name\":\"$BOX_VERSION\"}" \
        "https://api.cloud.hashicorp.com/vagrant/2022-09-30/registry/$REGISTRY_NAME/box/$box_name/versions")

    if echo "$response" | jq -e '.message | contains("already exists")' >/dev/null; then
        echo "Box version already exists, continuing..."
    else
        echo "$response"
        curl --header "Authorization: Bearer $HCP_TOKEN" \
            --request PUT \
            "https://api.cloud.hashicorp.com/vagrant/2022-09-30/registry/$REGISTRY_NAME/box/$box_name/version/$BOX_VERSION/release"
    fi
    # create box provider if it doesn't exist
    response=$(curl --header "Authorization: Bearer $HCP_TOKEN" \
        --header "Content-Type: application/json" \
        --request POST \
        --data "{\"name\":\"$BOX_PROVIDER\"}" \
        "https://api.cloud.hashicorp.com/vagrant/2022-09-30/registry/$REGISTRY_NAME/box/$box_name/version/$BOX_VERSION/providers")
    if echo "$response" | jq -e '.message | contains("already exists")' >/dev/null; then
        echo "Box provider already exists, continuing..."
    else
        echo "$response"
    fi
    checksum=$(sha256sum $box_file | cut -d ' ' -f 1)
    # create box architecture if it doesn't exist
    architecture_exists=false
    response=$(curl --header "Authorization: Bearer $HCP_TOKEN" \
        --header "Content-Type: application/json" \
        --request POST \
        --data "{\"architecture_type\":\"$BOX_ARCHITECTURE\",\"default\":true,\"box_data\":{\"checksum_type\":\"SHA256\",\"checksum\":\"$checksum\"}}" \
        "https://api.cloud.hashicorp.com/vagrant/2022-09-30/registry/$REGISTRY_NAME/box/$box_name/version/$BOX_VERSION/provider/$BOX_PROVIDER/architectures")
    if echo "$response" | jq -e '.message | contains("already exists")' >/dev/null; then
        echo "Box architecture already exists, will update checksum after upload..."
        architecture_exists=true
    else
        echo "$response"
    fi
    # get upload box url
    response=$(curl --header "Authorization: Bearer $HCP_TOKEN" \
        --request GET \
        "https://api.cloud.hashicorp.com/vagrant/2022-09-30/registry/$REGISTRY_NAME/box/$box_name/version/$BOX_VERSION/provider/$BOX_PROVIDER/architecture/$BOX_ARCHITECTURE/upload")
    upload_url=$(echo "$response" | jq -r '.url')
    # upload box
    curl --header "Authorization: Bearer $HCP_TOKEN" \
        --request PUT \
        --upload-file $box_file \
        $upload_url

    # update checksum if architecture already existed
    if [ "$architecture_exists" = true ]; then
        echo "Updating architecture checksum to match new upload..."
        response=$(curl --header "Authorization: Bearer $HCP_TOKEN" \
            --header "Content-Type: application/json" \
            --request PUT \
            --data "{\"box_data\":{\"checksum_type\":\"SHA256\",\"checksum\":\"$checksum\"}}" \
            "https://api.cloud.hashicorp.com/vagrant/2022-09-30/registry/$REGISTRY_NAME/box/$box_name/version/$BOX_VERSION/provider/$BOX_PROVIDER/architecture/$BOX_ARCHITECTURE")
        echo "$response"
    fi

    # delete box file
    rm $box_file
}

box_path=$BOX_FILE_PATH$BOX_FILE$BOX_SUFFIX

# Start the Vagrant VM; fail the script if bringing it up fails
if ! vagrant up; then
    echo "Error: 'vagrant up' failed; aborting."
    exit 1
fi

# Package the VM into a box; fail if packaging fails or the box file was not created
if ! vagrant package --output "$box_path"; then
    echo "Error: 'vagrant package' failed; attempting cleanup and aborting."
    vagrant destroy -f || true
    exit 1
fi

if [ ! -f "$box_path" ]; then
    echo "Error: expected box file '$box_path' not found after packaging; aborting."
    vagrant destroy -f || true
    exit 1
fi

# Cleanup the VM
vagrant destroy -f

# Upload to HashiCorp Cloud Platform
upload_box $box_path $BOX_FILE
