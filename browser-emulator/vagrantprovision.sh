#!/bin/bash
FIREFOX=$1
LIVEKIT=$2
START_MEDIASERVER=$3
QOE=$4
echo "FIREFOX: $FIREFOX"
echo "LIVEKIT: $LIVEKIT"
echo "START_MEDIASERVER: $START_MEDIASERVER"
echo "QOE: $QOE"
cd /opt/openvidu-loadtest/browser-emulator
chmod +x ./*.sh
PREPARE_SCRIPT_PATH=/opt/openvidu-loadtest/browser-emulator/prepare_scripts/
if [ "$LIVEKIT" = "true" ]; then
    PREPARE_SCRIPT_PATH=${PREPARE_SCRIPT_PATH}livekit/prepare
else
    PREPARE_SCRIPT_PATH=${PREPARE_SCRIPT_PATH}openvidu/prepare
fi
if [ "$QOE" = "false" ]; then
    PREPARE_SCRIPT_PATH=${PREPARE_SCRIPT_PATH}_no_qoe
fi
if [ "$FIREFOX" = "true" ]; then
    PREPARE_SCRIPT_PATH=${PREPARE_SCRIPT_PATH}_firefox
fi
${PREPARE_SCRIPT_PATH}.sh
usermod -aG docker vagrant
usermod -aG syslog vagrant
usermod -aG video vagrant
chown -R vagrant:vagrant /opt/openvidu-loadtest
crontab -r -u ubuntu
NPM_COMMAND="npm run start:prod"
if [ "$LIVEKIT" = "true" ]; then
    NPM_COMMAND=${NPM_COMMAND}-livekit
fi
if [ "$FIREFOX" = "true" ]; then
    NPM_COMMAND=${NPM_COMMAND}-firefox
fi
echo "@reboot cd /opt/openvidu-loadtest/browser-emulator && npm run build && $NPM_COMMAND > /var/log/crontab.log 2>&1" 2>&1 | crontab -u vagrant -

if [ "$START_MEDIASERVER" = "true" ]; then
    if [ "$LIVEKIT" = "true" ]; then
    curl -sSL https://get.livekit.io | bash
    (crontab -u vagrant -l ; echo '@reboot livekit-server --dev > /var/log/livekit.log 2>&1') | crontab -u vagrant -
    else
    cd /opt
    curl -sSL https://s3-eu-west-1.amazonaws.com/aws.openvidu.io/install_openvidu_latest.sh | bash
    cd openvidu
    rm docker-compose.override.yml
    sed -i "s/DOMAIN_OR_PUBLIC_IP=/DOMAIN_OR_PUBLIC_IP=127.0.0.1/g" .env
    sed -i "s/OPENVIDU_SECRET=/OPENVIDU_SECRET=vagrant/g" .env
    sed -i "s/OPENVIDU_STREAMS_VIDEO_MAX_RECV_BANDWIDTH=1000/OPENVIDU_STREAMS_VIDEO_MAX_RECV_BANDWIDTH=0/g" .env
    sed -i "s/OPENVIDU_STREAMS_VIDEO_MIN_RECV_BANDWIDTH=300/OPENVIDU_STREAMS_VIDEO_MIN_RECV_BANDWIDTH=0/g" .env
    sed -i "s/OPENVIDU_STREAMS_VIDEO_MAX_SEND_BANDWIDTH=1000/OPENVIDU_STREAMS_VIDEO_MAX_SEND_BANDWIDTH=0/g" .env
    sed -i "s/OPENVIDU_STREAMS_VIDEO_MIN_SEND_BANDWIDTH=300/OPENVIDU_STREAMS_VIDEO_MIN_SEND_BANDWIDTH=0/g" .env
    (crontab -u vagrant -l ; echo '@reboot cd /opt/openvidu && ./openvidu start > /var/log/openvidu.log 2>&1') | crontab -u vagrant -
    fi
fi
cd /opt/openvidu-loadtest/browser-emulator
./debug_vnc.sh

umount /vagrant

apt-get autoremove -y
apt-get clean -y
apt-get autoclean -y

dd if=/dev/zero of=/EMPTY bs=1M
rm -f /EMPTY

unset HISTFILE
rm -f /root/.bash_history
rm -f /home/vagrant/.bash_history

# Whiteout root
count=`df --sync -kP / | tail -n1  | awk -F ' ' '{print $4}'`;
count=$((count -= 1))
dd if=/dev/zero of=/tmp/whitespace bs=1024 count=$count;
rm /tmp/whitespace;

# Whiteout /boot
count=`df --sync -kP /boot | tail -n1 | awk -F ' ' '{print $4}'`;
count=$((count -= 1))
dd if=/dev/zero of=/boot/whitespace bs=1024 count=$count;
rm /boot/whitespace;

# Whiteout swap 
swappart=`cat /proc/swaps | tail -n1 | awk -F ' ' '{print $1}'`
swapoff $swappart;
dd if=/dev/zero of=$swappart;
mkswap $swappart;
swapon $swappart;
reboot now