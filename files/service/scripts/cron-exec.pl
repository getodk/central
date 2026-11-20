#!/usr/bin/env perl

# To be replaced by --env0-from when https://github.com/uutils/coreutils/pull/14609 lands.

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
