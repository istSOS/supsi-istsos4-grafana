#!/bin/sh
set -eu

printenv | sed 's/^\(.*\)$/export \1/g' > /etc/cron.env

exec cron -f