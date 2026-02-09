#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

git ls-files -z \
| xargs -0 ls -l -- \
| awk '
  BEGIN {
    print "[check-for-large-files] Checking for large files...";
  }

  $5 > 1000000 {
    ++n;
    print $5 "\t" $9;
  }

  END {
    if(n>0) {
      print "[check-for-large-files] !!! " n " LARGE FILE(S) FOUND";
      exit 1;
    } else {
      print "[check-for-large-files] No large files found ✅";
    }
  }
'
