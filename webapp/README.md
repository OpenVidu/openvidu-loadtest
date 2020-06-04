# WEBAPP

In this folder we provide the files for the openvidu webapp to perform the test.

## Files

`index.html`: Webapp html file.

`app.js`: Webbapp JavaScript file .

`openvidu-browser-X.Y.Z.js` and `openvidu-browser-X.Y.Z.min.js`: OpenVidu browser JS library.

`styles.css`: Webapp stylesheet.


## Deploy

Using the [CloudFormation-webapp.yml](https://github.com/OpenVidu/openvidu-loadtest/blob/recording_loadtest/aws/Cloudformation-webapp.yaml) this webbapp will be deployed in a EC2 instance.

The instance will serve the webapp and we will use it to provide to the browsers connect to the OpenVidu sessions

