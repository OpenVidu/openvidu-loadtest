# get all ec2 instances' urls with name Worker
INSTANCE_URLS=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=Worker" \
  --query 'Reservations[*].Instances[*].PublicDnsName' \
  --output text)
  # send a DELETE HTTP request to each instance
for instance_url in $INSTANCE_URLS
do
    curl --insecure -X DELETE https://$instance_url:5000/openvidu-browser/streamManager &
done
wait