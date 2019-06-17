ODK Central
===========

Central is an Open Data Kit server alternative that is early in its development. Like ODK Aggregate, it manages user accounts and permissions, stores form definitions, and allows data collection clients like ODK Collect to connect to it for form download and submission upload.

Our goal with Central is to create a modern sibling to Aggregate that is easier to install, easier to use, and more extensible with new features and functionality both directly in the software and with the use of our REST, OpenRosa, and OData programmatic APIs.

This repository serves as an umbrella for the Central project as a whole:

* Tickets/issues entrypoint for user problems with either the [server](https://github.com/opendatakit/central-backend) or the [client](https://github.com/opendatakit/central-frontend).
* Operations repository for packaging the server and client into a Docker Compose application.
* Release repository for publishing binary artifacts.

If you are looking for help, please take a look at the [Documentation Website](https://docs.opendatakit.org/central-intro/). If that doesn't solve your problem, please head over to the [ODK Forum](https://forum.opendatakit.org) and do a search to see if anybody else has had the same problem.

Contributing
============

We would love your contributions to Central. If you have thoughts or suggestions, please share them with us on the [Features board](https://forum.opendatakit.org/c/features) on the ODK Forum. If you wish to contribute code, you have the option of working on the Backend server ([contribution guide](https://github.com/opendatakit/central-backend/blob/master/CONTRIBUTING.md)), the Frontend website ([contribution guide](https://github.com/opendatakit/central-frontend/blob/master/CONTRIBUTING.md)), or both.

Operations
==========

This repository serves administrative functions, but it also contains the Docker code for building and running a production Central stack.

To learn how to run such a stack in production, please take a look at [our DigitalOcean installation guide](https://docs.opendatakit.org/central-install-digital-ocean/).

Running locally for development
-------------------------------

Clone this repository, then fetch the dependent repositories with `git submodule update -i`. Then, as long as you have standard Docker infrastructure installed, you should be able to simply `docker-compose up`.

Sample from-scratch commands on a Mac:

* `brew install docker docker-machine docker-compose` to install Docker things.
* `docker-machine create default` to create a VM; you can do `docker-machine create --driver vmwarefusion default` to use VMWare instead. This will download many things, set up a boot2docker VM, and provision it with Docker things.
* `eval $(docker-machine env default)` will inject your shell with the necessary credentials to connect to the VM/Docker things. **n.b.** you'll need to run this each time you want to do Docker things with a new shell!
* `docker-compose up` will then build and spin up the Docker services into the VM.
* `docker-machine ls` will give you an IP to connect to.
* `docker-compose exec service odk-cmd [ARGS]` will invoke the command-line utilities to perform tasks like provisioning accounts, granting them admin access, and resetting passwords.

License
=======

All of ODK Central is licensed under the [Apache 2.0](https://raw.githubusercontent.com/opendatakit/central/master/LICENSE) License.

