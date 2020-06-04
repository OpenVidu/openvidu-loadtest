# WEBAPP

In this folder we provide the files for the openvidu webapp to perform the test.

## Files

`index.html`: Webapp html file.

`app.js`: Webbapp JavaScript file .

`openvidu-webcomponent-X.Y.Z.js and openvidu-webcomponent-X.Y.Z.css`: Webcomponnet compiled file built from OpenVidu Call (you can know [how to build it here](https://docs.openvidu.io/en/2.14.0/developing/#compiling-openvidu-webcomponent)).

`styles.css`: Webapp stylesheet.


## Deploy

Using the [CloudFormation-webapp.yml](https://github.com/OpenVidu/openvidu-loadtest/blob/webcomponent_loadtest/aws/Cloudformation-webapp.yaml) this webbapp will be deployed in a EC2 instance.

The instance will serve the webapp and we will use it to provide to the browsers connect to the OpenVidu sessions

