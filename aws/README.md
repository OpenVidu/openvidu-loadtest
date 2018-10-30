# AWS

In this folder we provide the files for deploying and provisioning infraestructure on AWS EC2 to perform the test.

## Files

`EC2Instance-ElastestBrowsers.yaml`: Cloudformation template will launch and configure and AWS EC2 instance ready to launch an Internet Browser (Google Chrome).

`createAMI.sh`: Script to deploy the CloudFormation and building an Amazon Machine Image (AMI). You can use the AMI to launch several browsers.

`browserProvider.sh`: Once you have an AMI with the browser you can use this script to provide instances with a browser inside ready to test the app.

`./terminateInstances.sh`: Terminate all the instances used by the test.

## Configuration

You must perform some changes on the files provided in order to fit your needs. For example, depends on your region you need to use a different base AMI, we use Ubuntu 16.04 to install Docker and the browser, this AMI is provided by Amazon and it's different in each region.

You need to fill up two values in `createAMI.sh` script:

`IMAGE_ID`: Refer to [Amazon EC2 AMI Locator](https://cloud-images.ubuntu.com/locator/ec2/) to find a valid EC2 AMI. You need Ubuntu 16.04 Xenial.

`CF_URL`: You need to upload the template to an S3 bucket. To do so, go to [AWS S3](https://s3.console.aws.amazon.com/) and create a new bucket. Refer to the [AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/user-guide/create-bucket.html) if you have any doubt. When you upload the file keep in mind to grant permissions **allow to read** to everyone.

Set that URL in the script.

> Note: The script will exit with fail if one of those variables are unset.

## Creating the AMI

After configuring the script you will be able to launch it.

`$ ./EC2Instance-ElastestBrowsers.yaml`

In about five minutes more or less, you can check EC2 Dashboard -> Images -> AMIs and seeing the new AMI.

If you can't find it, try using filters like _owned by me_.

![Filter](https://github.com/OpenVidu/openvidu-loadtest/blob/master/aws/images/AMI_filter.png)

## How to use this AMI

Congratulations! If you're reading this means you made it to deploy. Now, every EC2 Instance you launch from this AMI will be provisioned with a Google Chrome Browser. Just one last step before began.

### Creating a Security Group

Login into EC2 Dashboard -> Network & Security -> Security Groups. You need to allow income to this ports:

| Port | Meaning  |
| -----| -------- |
| 22   | For SSH connection |
| 4444 | For selenoid endpoint. **This port is mandatory** |
| 6080 | If you want to see what happening through noVNC |
| 5900 | If you want to see what happening through VNC |

![Security Group](https://github.com/OpenVidu/openvidu-loadtest/blob/master/aws/images/security_group.png)

### Launching Instances

The script `browserProvider.sh` will support you to lauch instances after a few steps of configuration:

This script needs to know:

`IMAGE_ID`: The AMI ID we created.

`INSTANCE_TYPE`: The size (cpus and memory) of the instance(s).

`KEY_NAME`: The name of the key you want to use to connect to your instances through SSH.

`SECURITY_GROUP`: The security group name you created before.

This script takes the number of instances you want to launch for en environment variable `NUM_INSTANCES`, which has a default set to 1, so if you want to launch 10 instances:

```
$ export NUM_INSTANCES=10
$ ./browserProvider.sh
```

This script will return the instance id just created with its IP address, like:

```
i-05d123db91f86e280 34.251.104.229
i-0e808a9893f48d03a 34.254.253.175
i-004733dbc799bf965 18.203.235.199
i-0a1777c11c4123141 34.254.99.20
i-061593a1387d69745 34.244.17.57
i-092f8840965a2bb93 34.254.193.51
i-0ad5791bfeb283f68 34.245.65.77
i-007aeac48698c0020 54.194.25.177
i-085e60c5aceae1f82 52.209.110.82
i-02d784f8df1a6c88d 34.244.0.60
i-00eb2bf1545f9be07 54.76.129.229
```

Also, this script will end when all the instances are in the state **running** that means, ready to use.

### Cleaning

When you finish, you can use `terminateInstances.sh` script to terminate all the instances you created before. Keep in mind the AWS costs.

No configuration needed to run this script.

`./terminateInstances.sh`

## How can I know what's Happening

We provided a couple methods to investigate the instances behaviour.

### Using SSH

You can connect to the instances using SSH using a rsa key. From a terminal,

`$ ssh -i YOUR_KEY ubuntu@INSTANCE_IP`

Once connected to the instance, check the docker logs:

```
$ sudo -s
# docker logs chrome
```

> User ubuntu is not allow to use docker.

### Using (no)VNC

Using VNC is really useful while the test is running as you will see the test being executed.

The password is `selenoid`.

For **RealVNC**, download the binary from [here](https://www.realvnc.com/en/connect/download/viewer/) then, connect to the instance using the instance IP.

For **noVNC**, use the following URL `http://INSTANCE_IP:6080/vnc.html`

## What's Under the Car Bonnet?

We've created and provisioned an Ubuntu 16.04 EC2 instance with Docker and set a script which will start the container as soon as the instance boots.

Also the instance contains two fake media files:

```
/opt/openvidu/fakeaudio.wav
/opt/openvidu/fakevideo.y4m
```

To use with the tests.

All the instances will be lauched with the tag

`{Key=Type, Value=OpenViduLoadTest}`

in order to be able to identificate in the cloud and be able to terminate all of them when the test ends.

## What to do if you find a problem.

If you want to report an issue there's some useful information you could provide.

Try to execute the scripts in _debug_ mode:

`$ /bin/bash -x script`

and copy/paste the exit.

The cloudformation is configured to **not** rollback if it fails, so you could try to login into the instance and check the file:

`/var/log/cloud-init-output.log`

which contains the provisioning process and can light the problem.