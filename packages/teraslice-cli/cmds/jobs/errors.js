'use strict';
'use console';

const _ = require('lodash');
const reply = require('../lib/reply')();
const config = require('../lib/config');
const cli = require('./lib/cli');

exports.command = 'errors <cluster_sh> [job_id]';
exports.desc = 'List errors for all running and failing job on cluster.\n';
exports.builder = (yargs) => {
    cli().args('jobs', 'errors', yargs);
    yargs
        .option('from', {
            describe: 'error number to start query',
            default: 1
        })
        .option('size', {
            describe: 'size of error query',
            default: 100
        })
        .option('ex_id', {
            describe: 'Execution id to limit query',
            default: ''
        });
    yargs.example('teraslice-cli jobs errors cluster1');
    yargs.example('teraslice-cli jobs errors cluster1 --size 10');
    yargs.example('teraslice-cli jobs errors cluster1 99999999-9999-9999-9999-999999999999');
};

exports.handler = (argv, _testFunctions) => {
    const cliConfig = _.clone(argv);
    config(cliConfig, 'jobs:error').returnConfigData();
    const job = _testFunctions || require('./lib')(cliConfig);

    return job.errors()
        .catch(err => reply.fatal(err.message));
};
