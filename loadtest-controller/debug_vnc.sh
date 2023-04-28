#!/bin/bash
apt-get install -y x11vnc net-tools
# Credit to https://gist.github.com/tullmann/476cc71169295d5c3fe6
# Wait for X Server to be ready
echo "Xvfb :10 -screen 0 1920x1080x24 -ac &

echo \"Waiting for X Server :10 to be available\"

MAX=120 # About 60 seconds
CT=0
while ! xdpyinfo -display :10 >/dev/null 2>&1; do
    sleep 0.50s
    CT=\$(( CT + 1 ))
    if [ \"\$CT\" -ge \"\$MAX\" ]; then
        echo \"FATAL: \$0: Gave up waiting for X server :10\"
        exit 11
    fi
done

echo \"X is available\"

x11vnc -display :10 -forever -shared -bg -nopw" > /opt/openvidu-loadtest/browser-emulator/x11vnc_script.sh
chmod +x /opt/openvidu-loadtest/browser-emulator/x11vnc_script.sh
(crontab -u ubuntu -l ; echo '@reboot cd /opt/openvidu-loadtest/browser-emulator && ./x11vnc_script.sh > /var/log/x11vnc.log 2>&1') | crontab -u ubuntu -
sed '0,\/dev\/null/{s//var\/log\/ffmpeg.log/}' /opt/openvidu-loadtest/browser-emulator/recording_scripts/start-fake-media.sh > /tmp/tmpfile && mv /tmp/tmpfile /opt/openvidu-loadtest/browser-emulator/recording_scripts/start-fake-media.sh
chmod +x /opt/openvidu-loadtest/browser-emulator/recording_scripts/start-fake-media.sh