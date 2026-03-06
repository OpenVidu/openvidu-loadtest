#!/usr/bin/env bash
set -euox pipefail

curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor --batch --yes -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list
curl -fsSL https://www.virtualbox.org/download/oracle_vbox_2016.asc | gpg --dearmor --batch --yes -o /usr/share/keyrings/oracle-virtualbox-2016.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/oracle-virtualbox-2016.gpg] https://download.virtualbox.org/virtualbox/debian $(lsb_release -cs) contrib" | tee /etc/apt/sources.list.d/virtualbox.list
apt-get update
apt-get install -y vagrant virtualbox-7.1
