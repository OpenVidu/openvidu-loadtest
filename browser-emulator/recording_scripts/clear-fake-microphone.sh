#!/bin/bash
pactl unload-module module-pipe-source
rm -f $HOME/.config/pulse/client.conf