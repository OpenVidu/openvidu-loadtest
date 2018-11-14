FROM elastestbrowsers/chrome:latest-2.0.0

RUN sudo apt-get update && sudo apt-get install -y iptables
RUN sudo rm -Rf /tmp/* && sudo rm -Rf /var/lib/apt/lists/* || true

ENTRYPOINT [ "/usr/local/bin/entrypoint.sh" ]
