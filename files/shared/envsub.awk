#!/usr/bin/mawk -f

# Safer implemention of envsubst.
#
# Significant differences:
#
#   * require curly brackets around values
#   * require uppercase
#   * throw error if value is not defined, instead of just using empty string
#
# mawk is the awk implementation common to the containers we need to run this
# script in, so we use it here explicitly.

BEGIN {
  errorCount = 0;
}

{
  while(match($0, /\$\{[A-Z_][A-Z_0-9]*\}/) > 0) {
    k = substr($0, RSTART+2, RLENGTH-3);
    if(k in ENVIRON) {
      v = ENVIRON[k];
    } else {
      print "ERR: var not defined on line " NR ": ${" k "}" > "/dev/stderr";
      ++errorCount;
      v = "!!!VALUE-MISSING: " k "!!!"
    }
    gsub("\$\{" k "\}", v);
  }
  print $0;
}

END {
  if(errorCount > 0) {
    print "" > "/dev/stderr";
    print errorCount " error(s) found." > "/dev/stderr";
    exit 1;
  }
}
