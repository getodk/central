#!/usr/bin/env perl

use warnings;
use strict;


die "Not enough arguments.\nUsage: with-pgenvblock.pl /path/to/envblock program [program-arg, …]\n" if @ARGV < 2;

my $envblockfile = $ARGV[0];

open my $fh, '<:raw', $envblockfile
    or die "Cannot open '" . $envblockfile . "': $!";
my $content = do { local $/; <$fh> };
close $fh;

my @entries = split /\x00/, $content;

for my $entry (@entries) {
    if ($entry =~ /\A(?<varname>PG[^=]+)=(?<varvalue>.*)\Z/m) {
        $ENV{$+{varname}} = $+{varvalue};
    }
}

exec @ARGV[1..$#ARGV]
    or die;
