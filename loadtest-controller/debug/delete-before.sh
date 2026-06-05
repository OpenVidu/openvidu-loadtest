#!/bin/bash

BUCKET_NAME="openvidu-loadtest-2024-pion-2p"
DATE_THRESHOLD="2024-06-03T19:50:00Z"

# List all objects in the bucket and filter by the last modified date
aws s3api list-objects-v2 --bucket "$BUCKET_NAME" --query "Contents[?LastModified<'$DATE_THRESHOLD'].[Key]" --output text | while read -r key
do
    # Delete the object
    aws s3api delete-object --bucket "$BUCKET_NAME" --key "$key"
    echo "Deleted $key"
done