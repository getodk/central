ODK Central
===========

Central is an Open Data Kit server alternative that is early in its development. Like ODK Aggregate, it manages user accounts and permissions, stores form definitions, and allows data collection clients like ODK Collect to connect to it for form download and submission upload.

Our goal with Central is to create a modern sibling to Aggregate that is easier to install, easier to use, and more extensible with new features and functionality both directly in the software and with the use of our REST, OpenRosa, and OData programmatic APIs.

This repository serves as an umbrella for the Central project as a whole:

* Tickets/issues entrypoint for user problems with either the [server](https://github.com/im2019/central-backend) or the [client](https://github.com/im2019/central-frontend).
* Operations repository for packaging the server and client into a Docker Compose application.
* Release repository for publishing binary artifacts.

If you are looking for help, please take a look at the [Documentation Website](https://docs.opendatakit.org/central-intro/). If that doesn't solve your problem, please head over to the [ODK Forum](https://forum.opendatakit.org) and do a search to see if anybody else has had the same problem.

Operations
==========

This repository serves administrative functions, but it also contains the Docker code for building and running a production Central stack.

To learn how to run such a stack in production, please take a look at [our DigitalOcean installation guide](https://docs.opendatakit.org/central-install-digital-ocean/).

Development
===========

Add git modules:

```bash
git submodule update --init --recursive --remote
```

If you want to change code in submodules, change in the corresponding root, push the new code and update submodules in this repo:

```bash
git submodule update
```

License
=======

All of ODK Central is licensed under the [Apache 2.0](https://raw.githubusercontent.com/opendatakit/central/master/LICENSE) License.

