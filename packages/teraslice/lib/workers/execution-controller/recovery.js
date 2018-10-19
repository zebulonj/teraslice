'use strict';

const Promise = require('bluebird');
const parseError = require('@terascope/error-parser');
const _ = require('lodash');
const Queue = require('@terascope/queue');

function recovery(context, executionFailed, stateStore, executionContext) {
    const events = context.apis.foundation.getSystemEvents();
    const numOfSlicersToRecover = executionContext.config.slicers;
    const recoveryQueue = new Queue();

    const cleanupType = executionContext.config.recovered_slice_type;
    const recoverExecution = executionContext.config.recovered_execution;
    const { exId, jobId } = executionContext;

    let recoverComplete = true;
    let isShutdown = false;

    const logger = context.apis.foundation.makeLogger({ module: 'execution_recovery', ex_id: exId, job_id: jobId });

    const retryState = {};

    function initialize() {
        events.on('slice:success', _sliceComplete);
        recoverComplete = false;

        // once we have fully recovered, clean up event listners
        events.once('execution:recovery:complete', () => {
            events.removeListener('slice:success', _sliceComplete);
        });

        recoverSlices()
            .catch(executionFailed);
    }

    function _sliceComplete(sliceData) {
        retryState[sliceData.slice.slice_id] = false;
    }

    function getSlicerStartingPosition() {
        if (exitAfterComplete()) return Promise.resolve([]);

        const recoveredSlices = [];
        for (let i = 0; i < numOfSlicersToRecover; i += 1) {
            recoveredSlices.push(stateStore.executionStartingSlice(recoverExecution, i));
        }
        return Promise.all(recoveredSlices);
    }

    function _setId(slice) {
        retryState[slice.slice_id] = true;
    }

    function _processIncompleteSlices(slicerID) {
        return stateStore.recoverSlices(recoverExecution, slicerID, cleanupType)
            .then((slices) => {
                slices.forEach((slice) => {
                    _setId(slice);
                    recoveryQueue.enqueue(slice);
                });

                return slices.length;
            });
    }

    function _recoveryBatchCompleted() {
        return _.every(retryState, v => v === false);
    }

    function _retryState() {
        return _.cloneDeep(retryState);
    }

    function _waitForRecoveryBatchCompletion() {
        return new Promise((resolve) => {
            const checkingBatch = setInterval(() => {
                if (_recoveryBatchCompleted()) {
                    clearInterval(checkingBatch);
                    resolve(true);
                    return;
                }

                if (isShutdown) {
                    clearInterval(checkingBatch);
                    resolve(false);
                }
            }, 100);
        });
    }

    function recoverSlices() {
        const startingID = 0;
        return new Promise((resolve, reject) => {
            function retrieveSlices(slicerID) {
                if (isShutdown) {
                    resolve(false);
                    return;
                }

                _processIncompleteSlices(slicerID)
                    .then((recoveredSlicesCount) => {
                        if (recoveredSlicesCount === 0) {
                            const nextID = slicerID + 1;
                            // all slicers have been recovered
                            if (nextID > numOfSlicersToRecover) {
                                logger.warn(`recovered data for execution: ${exId} has successfully been enqueued`);
                                _waitForRecoveryBatchCompletion()
                                    .then((isComplete) => {
                                        if (isComplete) {
                                            resolve(true);
                                        } else {
                                            resolve(false);
                                        }
                                    });
                            } else {
                                retrieveSlices(nextID);
                            }
                        } else {
                            _waitForRecoveryBatchCompletion()
                                .then(() => retrieveSlices(slicerID));
                        }
                    })
                    .catch(err => reject(new Error(parseError(err))));
            }

            retrieveSlices(startingID);
        }).then(async (isComplete) => {
            if (!isComplete) {
                logger.warn(`recovered data for execution: ${exId} was shutdown before it could finish`);
                return;
            }
            recoverComplete = true;
            try {
                const executionStartingPoints = await getSlicerStartingPosition();
                events.emit('execution:recovery:complete', executionStartingPoints);
                return;
            } catch (err) {
                logger.warn(parseError(err));
            }
            events.emit('execution:recovery:complete', []);
        });
    }

    function newSlicer() {
        return Promise.resolve([() => new Promise((resolve) => {
            if (recoveryQueue.size() > 0) {
                resolve(recoveryQueue.dequeue());
            } else {
                const checkingQueue = setInterval(() => {
                    if (recoveryQueue.size() > 0) {
                        clearInterval(checkingQueue);
                        resolve(recoveryQueue.dequeue());
                        return;
                    }

                    if (recoverComplete || isShutdown) {
                        clearInterval(checkingQueue);
                        resolve(null);
                    }
                }, 100);
            }
        })]);
    }

    function shutdown() {
        let checkInterval;

        return new Promise((resolve) => {
            checkInterval = setInterval(() => {
                if (recoverComplete) {
                    resolve();
                }
            }, 100);
        })
            .timeout(context.sysconfig.teraslice.shutdown_timeout)
            .finally(() => {
                isShutdown = true;
                clearInterval(checkInterval);
            });
    }

    function recoveryComplete() {
        return recoverComplete;
    }

    // if cleanup is set, it implies that it should not continue after recovery
    function exitAfterComplete() {
        return cleanupType != null;
    }

    function testContext() {
        return {
            _retryState,
            _recoveryBatchCompleted,
            _setId,
            _waitForRecoveryBatchCompletion,
            _sliceComplete
        };
    }

    return {
        getSlicerStartingPosition,
        initialize,
        newSlicer,
        exitAfterComplete,
        recoveryComplete,
        recoverSlices,
        shutdown,
        __test_context: testContext,
    };
}

module.exports = recovery;
