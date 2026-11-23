#!/usr/bin/env perl

# To be replaced by --env0-from when GNU coreutils 9.12 is available in the service container.
#
# Check current version with:
#
#     docker compose run --no-deps --rm service env --version
#
# See:
#
# * https://www.gnu.org/software/coreutils/manual/html_node/env-invocation.html#index-_002d_002denv0_002dfrom
# * `docker compose run --no-deps --rm service env --help`

use warnings;
use strict;


die "Not enough arguments.\nUsage: cron-exec.pl /path/to/envblock program [program-arg, …]\n" if @ARGV < 2;

my $envblockfile = $ARGV[0];

open my $fh, '<:raw', $envblockfile
    or die "Cannot open '" . $envblockfile . "': $!";
my $content = do { local $/; <$fh> };
close $fh;

my @entries = split /\x00/, $content;

for my $entry (@entries) {
    if ($entry =~ /\A(?<varname>[^=]+)=(?<varvalue>.*)\Z/s) {
        $ENV{$+{varname}} = $+{varvalue};
    }
}

exec @ARGV[1..$#ARGV]
    or die;
