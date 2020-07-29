# WebApp Classroom

:warning: :warning: :warning: **WARNING** :warning: :warning: :warning:

>This webapp is a private project, so you need to have access to https://github.com/OpenVidu/openvidu-classroom-service

:warning: :warning: :warning: **WARNING** :warning: :warning: :warning:

In this folder we provide the files for the openvidu webapp to perform the test for OpenVidu Classroom.

## Files

`index.html`: Webapp html file.

`app.js`: Webbapp JavaScript file .


## Deploy WebApp

Using the [CloudFormation-webapp.yml](https://github.com/OpenVidu/openvidu-loadtest/blob/webcomponent_loadtest/aws/Cloudformation-webapp.yaml) this webbapp will be deployed in a EC2 instance.

Parameters used by the webapp are:

- KeyName: The name of your private key.
- InstanceType: EC2 Type of instance for your webapp.
- WebApp: This parameter should be `Call`

This will deploy a webapp created to be used with openvidu-classroom-service.

## Deploy Classroom Service

The webapp is not enough to test openvidu-classroom. An additional service needs to be deployed next to OpenVidu Server.
You need to ssh into your OpenVidu CE/PRO instance and deploy the classroom service. To do that just follow this steps:

1. Ssh into your OpenVidu instance.
2. Enter as root:
```
sudo su
```
2. Go to `/opt` directory:
```
cd /opt/
```
3. Clone openvidu-classroom-service repository (You need to have access to this repository because it's a private project):
```
git clone https://github.com/OpenVidu/openvidu-classroom-service.git
```
4. Install OpenJdk 8 and Maven:
```
apt update && apt install -y openjdk-8-jdk && apt install -y maven
```
5. Create docker image for openvidu-classroom-service:
```
cd /opt/openvidu-classroom-service/docker && ./create_image.sh
```
6. Replace `docker-compose.override.yml` in OpenVidu directory to deploy openvidu-classroom-service:
```
cp /opt/openvidu-classroom-service/docker/docker-compose.override.yml /opt/openvidu/docker-compose.override.yml
```

7. Restart openvidu:
```
./openvidu restart
```