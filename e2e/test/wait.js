'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const misc = require('./misc');

/*
 * Waits for the promise returned by 'func' to resolve to an array
 * then waits for the length of that array to match 'value'.
 */
function forLength(func, value, iterations) {
    return forValue(
        () => func()
            .then(result => result.length),
        value, iterations
    );
}

/*
 * Waits for the promise returned by 'func' to resolve to a value
 * that can be compared to 'value'. It will wait 'iterations' of
 * time for the value to match before the returned promise will
 * reject.
 */
function forValue(func, value, _iterations) {
    const iterations = _iterations || 100;
    let counter = 0;

    return new Promise(((resolve, reject) => {
        function checkValue() {
            func()
                .then((result) => {
                    counter += 1;
                    if (result === value) {
                        resolve(result);
                        return;
                    }
                    if (counter > iterations) {
                        reject(`forValue didn't find target value after ${iterations} iterations.`);
                    } else {
                        setTimeout(checkValue, 500);
                    }
                });
        }

        checkValue();
    }));
}

/*
 * Wait for 'node_count' nodes to be available.
 */
function forNodes(nodeCount) {
    return forLength(() => misc.teraslice().cluster
        .state()
        .then(state => _.keys(state)), nodeCount);
}

/*
 * Wait for 'workerCount' workers to be joined on job 'jobId'.  `iterations`
 * is passed to forValue and indicates how many times the condition will be
 * tested for.
 * TODO: Implement a more generic function that waits for states other than
 * 'joined'
 */
function forWorkersJoined(jobId, workerCount, iterations) {
    return forValue(() => misc.teraslice().cluster
        .slicers()
        .then((slicers) => {
            const slicer = _.find(slicers, s => s.job_id === jobId);
            if (slicer !== undefined) {
                return slicer.workers_joined;
            }
            return 0;
        }), workerCount, iterations)
        .catch((e) => {
            throw (new Error(`(forWorkersJoined) ${e}`));
        });
}

function waitForClusterMaster(timeoutMs = 60000) {
    const endAt = Date.now() + timeoutMs;
    const { cluster } = misc.teraslice();
    function _try() {
        if (Date.now() > endAt) {
            return Promise.reject(new Error(`Failure to communicate with the Cluster Master as ${timeoutMs}ms`));
        }
        return cluster.get('/cluster/state', {
            timeout: 1000,
            json: true,
        }).catch(() => _try());
    }

    return _try();
}

function waitForJobStatus(job, status) {
    const jobId = job._jobId;

    function logExErrors() {
        return job.errors()
            .then((errors) => {
                if (_.isEmpty(errors)) {
                    return null;
                }
                // eslint-disable-next-line no-console
                console.error(`${jobId} errors`, { errors });
                return null;
            })
            .catch(() => null);
    }

    function logExStatus() {
        return job.get(`/jobs/${jobId}/ex`)
            .then((exStatus) => {
                if (_.isEmpty(exStatus)) {
                    return null;
                }
                // eslint-disable-next-line no-console
                console.error(`${jobId} status`, exStatus);
                return null;
            })
            .catch(() => null);
    }

    return job.waitForStatus(status, 100, 60 * 1000)
        .catch((err) => {
            err.message = `Job: ${jobId}: ${err.message}`;
            return Promise.all([
                logExErrors(),
                logExStatus(),
            ]).then(() => Promise.reject(err));
        });
}

module.exports = {
    forValue,
    forLength,
    forNodes,
    forWorkersJoined,
    waitForJobStatus,
    waitForClusterMaster
};
