#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

set -e
STREAM_URL="https://odk-nginx.example.test:9001/v1/chunked"
BROKEN_STREAM_URL="${STREAM_URL}?crash=1"
CURL="curl --resolve odk-nginx.example.test:9001:127.0.0.1 --insecure --fail --verbose --silent --show-error"

# check completed stream on HTTP/1.1
$CURL --http1.1 ${STREAM_URL}

# check completed stream on HTTP/2
$CURL --http2-prior-knowledge ${STREAM_URL}


function check_broken_stream_detectable() {
    set +e
    $CURL "${1}" "${BROKEN_STREAM_URL}"
    local curl_exitcode=${?}
    set -e
    if [[ $curl_exitcode -ne "${2}" ]]; then
        printf "\n\n\nCrashed stream production should have been detected:\n\t— for http/1.1, with exitcode 18: \"Partial file. Only a part of the file was transferred.\"\n\t— for http/2, with exitcode 92: \"HTTP/2 stream 1 was not closed cleanly\"\n\n\n"
        exit 1
    fi
}

# check interrupted stream on HTTP/1.1
check_broken_stream_detectable --http1.1 18

# # check interrupted stream on HTTP/2
check_broken_stream_detectable --http2-prior-knowledge 92
