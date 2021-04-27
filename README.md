ODK Central
===========

Central is the [ODK](https://getodk.org/) server. It manages user accounts and permissions, stores form definitions, and allows data collection clients like ODK Collect to connect to it for form download and submission upload.

Our goal with Central is to create a modern server that is easy to install, easy to use, and extensible with new features and functionality both directly in the software and with the use of our REST, OpenRosa, and OData programmatic APIs.

This repository serves as an umbrella for the Central project as a whole:

* Operations repository for packaging the server and client into a Docker Compose application.
* Release repository for publishing binary artifacts. Release notes can be found in this repository: see the [releases](https://github.com/getodk/central/releases).

If you are looking for help, please take a look at the [Documentation Website](https://docs.getodk.org/central-intro/). If that doesn't solve your problem, please head over to the [ODK Forum](https://forum.getodk.org) and do a search to see if anybody else has had the same problem. If you've identified a new problem or have a feature request, please post on the forum. We prefer forum posts to Github issues because more of the community is on the forum.

Contributing
============

We would love your contributions to Central. If you have thoughts or suggestions, please share them with us on the [Features board](https://forum.getodk.org/c/features) on the ODK Forum. If you wish to contribute code, you have the option of working on the Backend server ([contribution guide](https://github.com/getodk/central-backend/blob/master/CONTRIBUTING.md)), the Frontend website ([contribution guide](https://github.com/getodk/central-frontend/blob/master/CONTRIBUTING.md)), or both. To set up a development environment, first follow the [Backend instructions](https://github.com/getodk/central-backend#setting-up-a-development-environment) and then optionally the [Frontend instructions](https://github.com/getodk/central-frontend#setting-up-your-development-environment).

In addition to the Backend and the Frontend, Central deploys services:

* Central relies on [pyxform-http](https://github.com/getodk/pyxform-http) for converting forms from XLSForm. It generally shouldn't be needed in development but can be run locally.
* Central relies on [Enketo](https://github.com/enketo/enketo-express) for web form functionality. Neither the Backend nor the Frontend are configured to work with Enketo in development. Instead, you can drive local development that integrates with Enketo using tests and then try new functionality in a [production environment](https://docs.getodk.org/central-install-digital-ocean/) by [checking out a commit](https://docs.getodk.org/central-upgrade/) from your fork. Be sure to follow the upgrade instructions exactly. In particular, do not run `docker-compose down` because this will recreate new volumes instead of using existing ones.

Operations
==========

This repository serves administrative functions, but it also contains the Docker code for building and running a production Central stack.

To learn how to run such a stack in production, please take a look at [our DigitalOcean installation guide](https://docs.getodk.org/central-install-digital-ocean/).

License
=======

All of ODK Central is licensed under the [Apache 2.0](https://raw.githubusercontent.com/getodk/central/master/LICENSE) License.
