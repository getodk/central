	## Helm Chart for ODK Central

ODK Central Helm Chart
===========

Central is the [ODK](https://getodk.org/) server. It manages user accounts and permissions, stores form definitions, and allows data collection clients like ODK Collect to connect to it for form download and submission upload.

This repository is the helm chart for a kubernetes deployment of the Central project as a whole



Features
============
# Managing Users in Central
- Web User Roles
* Managing Web Users
* Creating a Web User
* Assigning a site-wide Web User Role
* Resetting a Web User password
* Retiring a Web User
- Managing App Users
* Creating an App User
* Configuring an App User mobile device
* Revoking an App User
# Managing Projects in Central
- Creating a Project
- Managing a Project
* Editing Project Settings
* Managing Project Roles
* Managing Project App Users
* Managing Form Access
* Archiving a Project
# Managing Forms in Central
# Managing Form Submissions in Central


Technical
==========

ODK Central uses a number of containers to run, most importantly:

- [Enketo](https://github.com/enketo/enketo-express) - ODK Central relies on Enketo for Webform functionality.
- [Pyxform](https://github.com/getodk/pyxform-http) - Central relies on pyxform-http to convert an XLSForm to an ODK XForm.
- [Nginx] - Central uses Nginx as a proxy ODK, which proxies both the Enketo and Service containers.
- [Postgres] - Central uses Postgresql for its datastore.
- [Redis] - Central uses the Redis in-memory data store as both a message broker and cache.


Installation
==========


This repository provides a method to install ODK Central into a kubernetes cluster as a helm chart. The minimum requirements as recommended by ODK is providing 1Gb of memory to the system. This said, the k8s deployments vary in resource reservations (both memory and CPU) and we recommend you tailor this to your need, however the Enketo Deployment and Pyxform Deployment must be given sufficient space otherwise the pods will fail to start.

Install the dependencies start the server:

```sh
git clone https://github.com/ntandomng/ODK-Helm.git
kubectl config get-contexts
kubectl apply -f ./namespace.yaml && kubectl apply -f ./nginx-service.yaml #PLEASE CREATE THESE MANIFESTS AS PER THE K8S MANIFESTS SECTION
```

After the namespace and nginx-service are both installed, wait until the loadbalancer IP address (a URL) is generated, then grab that URL and paste it in the following three files under the ODK-Helm/charts/templates directory.
 
# enketo-deployment.yaml
# nginx-deployment.yaml
# service-deployment.yaml

In each of the files above, we need to replace the "value" of the "DOMAIN" environment variable, by pasting over the string "PASTE-NEW-VALUE-FROM-COPIED-LOADBALANCER-HERE" as per the following example

```
      containers:
        - env:
            - name: DOMAIN
              value: "PASTE-NEW-VALUE-FROM-COPIED-LOADBALANCER-URL-HERE"
            - name: SUPPORT_EMAIL
              value: "ntando@fynarfin.io"
```

Once all three files are updated with the URL, you can install the helm chart

```sh
helm install odk-central ODK-Helm
```

> IMPORTANT NOTE:
> The enketo secret and api keys are unique to your deployment.
> The chart automatically generates these for you, but in case you wanted to manually generate these, see the below commands:

```sh
sed -i "/^[[:space:]]*enketo-secret:/ s/:.*/: `LC_ALL=C tr -dc '[:alnum:]' < /dev/urandom | head -c64 `/" ./ODK-Helm/templates/secrets-configmap.yaml
sed -i "/^[[:space:]]*enketo-less-secret:/ s/:.*/: `LC_ALL=C tr -dc '[:alnum:]' < /dev/urandom | head -c32 `/" ./ODK-Helm/templates/secrets-configmap.yaml
sed -i "/^[[:space:]]*enketo-api-key:/ s/:.*/: `LC_ALL=C tr -dc '[:alnum:]' < /dev/urandom | head -c128 `/" ./ODK-Helm/templates/secrets-configmap.yaml
```

To confirm that the installation was succefful, use the following:

```sh
helm ls
kubectl get all -n odk
```

Once installation is confirmed, the first user must be created, using the following commands:

```sh
kubectl exec -i -t -n odk `kubectl get pods --no-headers -o custom-columns=":metadata.name" -n odk | grep service` -c service -- sh -c "clear; (bash || ash || sh)"
odk-cmd --email YOUREMAIL@ADDRESSHERE.com user-create
odk-cmd --email YOUREMAIL@ADDRESSHERE.com user-promote
```

Using the helm repository method:

```sh
#echo fill this in when the app is added on the helm repo
```

K8S Manifests
=============
Create two files OUTSIDE the chart directory named namespace.yaml and nginx-service.yaml (these will be used in the installation process)

Namespace
```
 apiVersion: v1
 kind: Namespace
 metadata:
   name: odk
```


Nginx Service
```
apiVersion: v1
kind: Service
metadata:
  labels:
    odk.service: nginx
  name: nginx
  namespace: odk
spec:
  ports:
    - name: "80"
      port: 80
      targetPort: 80
    - name: "443"
      port: 443
      targetPort: 443
  selector:
    odk.service: nginx
  type: LoadBalancer
```

Troubleshooting
===============

Should the nginx-deployment fail to create an ssl certificate follow these steps to try resolve:
* uninstall the helm chart
```sh
helm uninstall odk-central
```

* uninstall the nginx-service
```sh
kubectl delete -f ./nginx-service.yaml
```

* redeploy the nginx-service
* install the helm chart


License
=======

All of ODK Central is licensed under the [Apache 2.0](https://raw.githubusercontent.com/getodk/central/master/LICENSE) License.
