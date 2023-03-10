ODK Central
===========

![Platform](https://img.shields.io/badge/platform-Docker-blue.svg)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Build status](https://circleci.com/gh/getodk/central.svg?style=shield)](https://circleci.com/gh/getodk/central)

Central is the [ODK](https://getodk.org/) server. It manages user accounts and permissions, stores Form definitions, and allows data collection clients like ODK Collect to connect to it for Form download and Submission upload.

Our goal with Central is to create a modern server that is easy to install, easy to use, and extensible with new features and functionality both directly in the software and with the use of our REST, OpenRosa, and OData programmatic APIs.

This repository serves as an umbrella for the Central project as a whole:

* Operations repository for packaging the server and client into a Docker Compose application.
* Release repository for publishing binary artifacts. Release notes can be found in this repository: see the [releases](https://github.com/getodk/central/releases).

If you are looking for help, please take a look at the [Documentation Website](https://docs.getodk.org/central-intro/). If that doesn't solve your problem, please head over to the [ODK Forum](https://forum.getodk.org) and do a search to see if anybody else has had the same problem. If you've identified a new problem or have a feature request, please post on the forum. We prefer forum posts to GitHub issues because more of the community is on the forum.

Contributing
------------

We would love your contributions to Central. If you have thoughts or suggestions, please share them with us on the [Features board](https://forum.getodk.org/c/features) on the ODK Forum. If you wish to contribute code, you have the option of working on the Backend server ([contribution guide](https://github.com/getodk/central-backend/blob/master/CONTRIBUTING.md)), the Frontend website ([contribution guide](https://github.com/getodk/central-frontend/blob/master/CONTRIBUTING.md)), or both. To set up a development environment, first follow the [Backend instructions](https://github.com/getodk/central-backend#setting-up-a-development-environment) and then optionally the [Frontend instructions](https://github.com/getodk/central-frontend#setting-up-your-development-environment).

The `master` branch of this repository is a stable branch that users clone when they install Central in production. The `next` branch reflects ongoing development for the next version of Central. Note that this differs from the `central-backend` and `central-frontend` repositories, where `master` is the development branch. If you create a PR to this repository, please target the `next` branch unless you are only changing documentation like the readme.

In addition to the Backend and the Frontend, Central deploys services:

* Central relies on [pyxform-http](https://github.com/getodk/pyxform-http) for converting Forms from XLSForm. It generally shouldn't be needed in development but can be run locally.
* Central relies on [Enketo](https://github.com/enketo/enketo-express) for Web Form functionality. Enketo can be run locally and configured to work with Frontend and Backend in development by following [these instructions](https://github.com/getodk/central-frontend/blob/master/docs/enketo.md).

Operations
----------

This repository serves administrative functions, but it also contains the Docker code for building and running a production Central stack.

To learn how to run such a stack in production, please take a look at [our DigitalOcean installation guide](https://docs.getodk.org/central-install-digital-ocean/).

License
-------

All of ODK Central is licensed under the [Apache 2.0](https://raw.githubusercontent.com/getodk/central/master/LICENSE) License.
