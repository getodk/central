#!/usr/bin/bash

head -c1024 /dev/urandom | LC_ALL=C tr -dc '[:alnum:]' | head -c64  > enketo-secret
head -c512  /dev/urandom | LC_ALL=C tr -dc '[:alnum:]' | head -c32  > enketo-less-secret
head -c2048 /dev/urandom | LC_ALL=C tr -dc '[:alnum:]' | head -c128 > enketo-api-key