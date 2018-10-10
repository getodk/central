ODK Central
===========

This repository serves several functions:

* Tickets/issues entrypoint for user problems with either the [server](https://github.com/opendatakit/central-backend) or the [client](https://github.com/opendatakit/central-frontend).
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
* `docker-compose exec service odk-cmd [ARGS]` will invoke the command-line utilities to perform tasks like provisioning accounts, granting them admin access, and resetting passwords.

Running on DigitalOcean
-----------------------

If you'd like to set up an ODK server that's accessible from anywhere via the Internet, DigitalOcean provides a one-click configuration that's nicely geared with nearly all the tools you'll need to set up your new server. The only thing it doesn't do is register a domain name, which you will have to do in order to obtain a security certificate for your server.

1. From the DigitalOcean control panel, use the Create button at the top to create a new Droplet. This is their name for the server you can access and manage.
2. At the very top, under **Choose an image**, switch to the **One-click apps** tab and select the **Docker** option. The version does not matter.
3. There are a few options on this page that may be important to you:
    * There is a column for standard droplets and another for more expensive optimized droplets. In general, you should not need optimized droplets.
    * The **size** option affects the amount of memory available to your server. This does _not_ impact the amount of _storage_ you are allowed, it sets the amount of "thinking room" the server gets while it's working on things. If you don't expect many forms to be submitted at once (example number TBD) you can start with 1GB. Higher-load servers may need 2GB or more.
    * The datacenter region selects where physically your server will be located. If you have security concerns, this is your chance to decide which country hosts your data. Otherwise, generally selecting the option with closest geographic proximity to your users is a good idea.
    * If you are technically savvy and understand whan an SSH key is, there is a field here that you will want to fill in. If not, don't worry about it.
4. Once you click on **Create**, you'll be taken back to the Droplet management page. It may think for a moment, and then your new server should appear. Next to it will be an IP address, which should look something like `183.47.101.24`. This is where your server is publicly located on the Internet. Don't worry, nobody can do anything with it until you let them.
5. Now is the time to set up a domain name. You'll need to do this for two reasons: a memorable name (eg `google.com`) will be easier to access than a pile of numbers, and you cannot obtain a security certificate without one. You have some options here:
    * You can pay one of the many popular commercial domain registrars for a full domain name, like `MyOdkCollectionServer.com`. Search for "domain registrar" to find one of these.
    * You can use a free DNS service: we recommend [FreeDNS](https://freedns.afraid.org/), which has run for a long time and has a good reputation. With it, you can obtain a free name, albeit with a fixed second half (eg `MyOdkCollectionServer.dynet.com`). If you choose this route, we recommend using one of the _less popular_ names, as the heavily occupied names can run into quota troubles obtaining a security certificate.
    * Whichever option you choose, you'll want to look at [DigitalOcean's guide](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-host-name-with-digitalocean) on setting up domain names for your Droplet. In general, you'll point your domain name in DigitalOcean's direction at your registrar, then in DigitalOcean itself you'll want to create an A record that points to the IP address we found above.
6. New domain names take a little bit to get working. In the meantime, we can get working on installing the server software. First, you'll need to be able to log into the server itself. If you are an advanced user who filled in an SSH key above, you're good to go. Otherwise, click on your new server's name in the **Droplets** management panel, then go to **Access** on the left. Choose to Reset the root password so that a password gets emailed to you.
7. Once you have that password in hand, you'll be able to use the **Launch Console** button to log into your server: when it asks for `login`, type `root` and press **Enter**. Then type the password you were emailed and press **Enter** again.
8. Once you are in your server, you'll want to change your password so that people snooping your email do not gain access. Type `passwd` and press **Enter**, then follow the instructions to choose a new password. From now on, you will use that password to log in.
9. Now you'll need to download the software. In the server window, type `git clone https://github.com/opendatakit/central` and press **Enter**. It should think for some time and download many things. Then type `cd central` to start working with the software.
10. You now have the framework of the server software, but some components are missing. Type `git submodule update -i` and press **Enter** to download them.
11. You now need to update some settings. Type `nano .env` and press **Enter**.
    * Change the `SSLTYPE` line to read: `SSLTYPE=letsencrypt`. This instructs the server to attempt to obtain a security certificate from the free Let's Encrypt provider.
    * Change the `SSLDOMAIN` line so that after the `=` is the domain name you registered above. As an example: `SSLDOMAIN=MyOdkCollectionServer.com`. Do not include anything like `http://`.
    * Change the `SSLEMAIL` line so that after the `=` is your own email address. The Let's Encrypt service will use this address only to notify you if something is wrong with your security certificate.
    * Hold `Ctrl` and press `X` to quit the text editor. Press `Y` to indicate that you want to save the file, and then press **Enter** to confirm the file name. Do not change the file name.
12. Next, you need to bundle everything together into a server. Run `docker-compose build` to do this. When that finishes, run `docker-compose create`.
13. Now we want to run your new ODK server software. But we don't want to just run it once: if we do that, then if your server machine crashes or restarts, the software won't start back up. We want to tell the machine to always run the server.
    1. We have provided the file required to do this. To put it in the right spot, run `cp files/docker-compose@.service /etc/systemd/system`. This configuration file teaches the machine how to run our server.
    2. Now run `systemctl start docker-compose@central` to start Docker, which will then load the ODK server. The first time you start it, it will take a while to set itself up.
    3. Now you'll want to see whether everything is running correctly:
        1. To see if Docker itself is working correctly, you can run `systemctl status docker-compose@central`. If you see text that says `Active: active (running)` then everything is working great.
        2. To see if ODK has finished loading inside of Docker, run `docker-compose ps`. Under the `State` column, you will want to see text that reads `Up (healthy)`. If you see `Up (health: starting)`, give it a few minutes. If you see some other text, something has gone wrong.
    4. Since we're finally sure that everything is working, run `systemctl enable docker-compose@central`. This will make sure the ODK server is always running, even if something goes wrong or the machine reboots.
14. At this point, you can try visiting the domain name you registered to see if it all worked. If it doesn't, you may have to wait a few minutes or hours for the domain name itself to get working.
15. Once you do see it working, you'll want to set up your first administrator account. To do this:
    1. In the server window, type `docker-compose exec service odk-cmd --email YOUREMAIL@ADDRESSHERE.com user-create`. Press **Enter**, and you will be asked for a password for this new account.
    2. The previous step created an account but did not make it an administrator. To do this, type `docker-compose exec service odk-cmd --email YOUREMAIL@ADDRESSHERE.com user-promote` **Enter**.
    3. You are done for now, but if you ever lose track of your password, you can always reset it by typing `docker-compose exec service odk-cmd --email YOUREMAIL@ADDRESSHERE.com user-set-password`. As with account creation, you will be prompted for a new password after you press **Enter**.
    4. Once you have one account, you do not have to go through this process again for future accounts: you can log into the website with your new account, and directly create new users that way.

Upgrading to the latest version
-------------------------------

* Log onto your server and navigate back to the project directory (likely `cd central`).
* Get the latest version of the infrastructure: `git pull`.
    * If you have made local changes to the files, you may have to start with `git stash`, then run `git stash pop` after you perform the `pull`.
* Get the latest client and server: `git submodule update -i`.
* Build your server from the latest code you just fetched: `docker-compose build`.
* Restart the running server to pick up the changes: `systemctl restart docker-compose@central`.

Custom Configurations
---------------------

Disabling Sentry
================

By default, we enable [Sentry error logging](https://sentry.io) on the backend server, which provides with an anonymized log of unexpected programming errors that occur while your server is running. This information never includes any of your user or form data, but if you feel uncomfortable with this anyway, you can take the following steps to disable Sentry:

1. Edit the file `files/service/config.json.template` and remove the `sentry` lines, starting with `"sentry": {` through the next three lines until you remove the matching `}`.
2. Build and run. If you already had a service image built, you may need to wipe it (`docker-compose rm service`).

Using a custom SSL certificate (advanced)
=========================================

To use a custom SSL certificate:

1. Generate appropriate `fullchain.pem` (`-out`) and `privkey.pem` (`-keyout`) files.
2. Copy those files into `files/local/customssl/` within the repository root.
3. In `.env`, set `SSL_TYPE` to `customssl` and set `DOMAIN` to `local`.
4. Build and run. If you already had an nginx image built, you may need to wipe it. Don't worry, no data will be lost in this case.

