#!/usr/bin/env bash
set -euox pipefail

export DEBIAN_FRONTEND=noninteractive

curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor --batch --yes -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list
apt-get update
echo virtualbox-ext-pack virtualbox-ext-pack/license select true | debconf-set-selections
echo virtualbox-ext-pack virtualbox-ext-pack/license seen true | debconf-set-selections
apt-get install -y vagrant virtualbox virtualbox-ext-pack
