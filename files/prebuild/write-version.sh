#!/bin/sh

{ echo "versions:"; git rev-parse HEAD; git submodule; } > /tmp/version.txt

