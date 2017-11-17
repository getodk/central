Effective Spork
===============

This repository serves several functions:

* Tickets/issues entrypoint for user problems with either the [server](https://github.com/nafundi/jubilant-garbanzo) or the [client](https://github.com/nafundi/super-adventure).
* Central project management repository; in particular the projectboards.
* Aggregation repository for packaging the server and client into a Docker Compose application.
* Release repository for publishing binary artifacts.

Running locally
---------------

Clone this repository, then fetch the dependent repositories with `git submodule update -i`. Then, as long as you have standard Docker infrastructure installed, you should be able to simply `docker-compose up`.

Sample from-scratch commands on a Mac:

* `brew install docker docker-machine docker-compose` to install Docker things.
* `docker-machine create default` to create a VM; you can do `docker-machine create --driver vmwarefusion default` to use VMWare instead. This will download many things, set up a boot2docker VM, and provision it with Docker things.
* `eval $(docker-machine env default)` will inject your shell with the necessary credentials to connect to the VM/Docker things. **n.b.** you'll need to run this each time you want to do Docker things with a new shell!
* `docker-compose up` will then build and spin up the Docker services into the VM.
* `docker-machine ls` will give you an IP to connect to.

